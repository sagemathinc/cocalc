/*
Add, remove and invite collaborators on projects.
*/

import getLogger from "@cocalc/backend/logger";
import type { AddCollaborator } from "@cocalc/conat/hub/api/projects";
import { db, getPool } from "@cocalc/database";
import { is_paying_customer } from "@cocalc/database/postgres/account-queries";
import { project_has_network_access } from "@cocalc/database/postgres/project-queries";
import { query } from "@cocalc/database/postgres/query";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import getName from "@cocalc/server/accounts/get-name";
import { send_invite_email } from "@cocalc/server/hub/email";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { callback2 } from "@cocalc/util/async-utils";
import { RESEND_INVITE_INTERVAL_DAYS } from "@cocalc/util/consts/invites";
import {
  days_ago,
  is_array,
  is_valid_email_address,
  lower_email_address,
  uuid,
} from "@cocalc/util/misc";
import {
  OwnershipErrorCode,
  type UserGroup,
  validateUserTypeChange,
} from "@cocalc/util/project-ownership";

import { add_collaborators_to_projects } from "./collab";
import {
  ensureCanManageCollaborators,
  ensureCanRemoveUser,
  OwnershipError,
} from "./ownership-checks";

const logger = getLogger("project:collaborators");

export { OwnershipError } from "./ownership-checks";

export async function removeCollaborator({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    account_id: string;
    project_id: string;
  };
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
    throw Error("user must be a collaborator");
  }

  // CRITICAL: Block ALL owner removals (anyone trying to remove an owner)
  // Owners must be demoted to collaborator first, THEN removed
  await ensureCanRemoveUser({
    project_id: opts.project_id,
    target_account_id: opts.account_id,
  });

  // Check manage_users_owner_only setting (unless removing self)
  const is_self_remove = account_id === opts.account_id;
  if (!is_self_remove) {
    await ensureCanManageCollaborators({
      project_id: opts.project_id,
      account_id,
    });
  }

  await callback2(db().remove_collaborator_from_project, opts);
  await logRemoveCollaboratorEvent({
    project_id: opts.project_id,
    actor_account_id: account_id,
    removed_account_id: opts.account_id,
  });
}

async function logRemoveCollaboratorEvent({
  project_id,
  actor_account_id,
  removed_account_id,
}: {
  project_id: string;
  actor_account_id: string;
  removed_account_id: string;
}): Promise<void> {
  const removed_name = (await getName(removed_account_id)) ?? "Unknown User";
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO project_log(id,project_id,time,account_id,event) VALUES($1,$2,NOW(),$3,$4)",
      [
        uuid(),
        project_id,
        actor_account_id,
        {
          event: "remove_collaborator",
          removed_name,
          removed_account_id,
        },
      ],
    );
  } catch {
    // Avoid failing the removal if logging fails.
  }
}

async function logInviteCollaboratorEvent({
  project_id,
  actor_account_id,
  invitee_account_id,
}: {
  project_id: string;
  actor_account_id: string;
  invitee_account_id: string;
}): Promise<void> {
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO project_log(id,project_id,time,account_id,event) VALUES($1,$2,NOW(),$3,$4)",
      [
        uuid(),
        project_id,
        actor_account_id,
        { event: "invite_user", invitee_account_id },
      ],
    );
  } catch {
    // Avoid failing the invite if logging fails.
  }
}

async function logInviteNonuserEvent({
  project_id,
  actor_account_id,
  invitee_email,
}: {
  project_id: string;
  actor_account_id: string;
  invitee_email: string;
}): Promise<void> {
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO project_log(id,project_id,time,account_id,event) VALUES($1,$2,NOW(),$3,$4)",
      [
        uuid(),
        project_id,
        actor_account_id,
        { event: "invite_nonuser", invitee_email },
      ],
    );
  } catch {
    // Avoid failing the invite if logging fails.
  }
}

async function logChangeCollaboratorTypeEvent({
  project_id,
  actor_account_id,
  target_account_id,
  old_group,
  new_group,
}: {
  project_id: string;
  actor_account_id: string;
  target_account_id: string;
  old_group: UserGroup;
  new_group: UserGroup;
}): Promise<void> {
  const target_name = (await getName(target_account_id)) ?? "Unknown User";
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO project_log(id,project_id,time,account_id,event) VALUES($1,$2,NOW(),$3,$4)",
      [
        uuid(),
        project_id,
        actor_account_id,
        {
          event: "change_collaborator_type",
          target_account_id,
          target_name,
          old_group,
          new_group,
        },
      ],
    );
  } catch {
    // Avoid failing the change if logging fails.
  }
}

export async function addCollaborator({
  account_id,
  opts,
}: {
  account_id: string;
  opts: AddCollaborator;
}): Promise<{ project_id?: string | string[] }> {
  let projects: undefined | string | string[] = opts.project_id;
  let accounts: undefined | string | string[] = opts.account_id;
  let tokens: undefined | string | string[] = opts.token_id;
  let is_single_token = false;

  if (tokens) {
    if (!is_array(tokens)) {
      is_single_token = true;
      tokens = [tokens];
    }
    // projects will get mutated below as tokens are used
    projects = Array(tokens.length).fill("");
  }
  if (!is_array(projects)) {
    projects = [projects] as string[];
  }
  if (!is_array(accounts)) {
    accounts = [accounts];
  }

  // Check manage_users_owner_only setting for each project
  // Only check if not using tokens (tokens have their own permission system)
  if (!tokens && projects && projects.length > 0) {
    for (const project_id of projects as string[]) {
      if (!project_id) continue; // skip empty strings
      await ensureCanManageCollaborators({ project_id, account_id });
    }
  }

  await add_collaborators_to_projects(
    db(),
    account_id,
    accounts as string[],
    projects as string[],
    tokens as string[] | undefined,
  );
  // Tokens determine the projects, and it may be useful to the client to know what
  // project they just got added to!
  let project_id: string | string[] | undefined;
  if (is_single_token) {
    project_id = projects[0];
  } else {
    project_id = projects;
  }
  return { project_id };
}

export async function changeUserType({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    project_id: string;
    target_account_id: string;
    new_group: UserGroup;
  };
}): Promise<void> {
  const { project_id, target_account_id, new_group } = opts;

  // 1. Verify requester is a project member
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw new OwnershipError(
      "Not a project member",
      OwnershipErrorCode.INVALID_REQUESTING_USER,
    );
  }

  // 2. Get fresh project data (users field only)
  const project = await query({
    db: db(),
    table: "projects",
    select: ["users"],
    where: { project_id },
    one: true,
  });

  if (!project) {
    throw new OwnershipError(
      "Project not found",
      OwnershipErrorCode.INVALID_PROJECT_STATE,
    );
  }

  const users = project.users;

  // 3. Get requesting user's group
  const requesting_user_group = users?.[account_id]?.group as
    | UserGroup
    | undefined;

  // 4. Get target user's current group
  const target_current_group = users?.[target_account_id]?.group as
    | UserGroup
    | undefined;

  // 5. Validate the change
  const validation = validateUserTypeChange({
    requesting_account_id: account_id,
    requesting_user_group,
    target_account_id,
    target_current_group,
    target_new_group: new_group,
    all_users: users,
  });

  if (!validation.valid) {
    throw new OwnershipError(
      validation.error ?? "Invalid user type change",
      validation.errorCode ?? OwnershipErrorCode.INVALID_USER,
    );
  }

  const old_group = (target_current_group ?? new_group) as UserGroup;

  // 6. Perform the change via add_user_to_project
  await callback2(db().add_user_to_project, {
    project_id,
    account_id: target_account_id,
    group: new_group,
  });

  // 7. Log the change for audit trail
  await logChangeCollaboratorTypeEvent({
    project_id,
    actor_account_id: account_id,
    target_account_id,
    old_group,
    new_group,
  });
  logger.info("changeUserType", {
    project_id,
    actor_account_id: account_id,
    target_account_id,
    old_group,
    new_group,
  });
}

async function allowUrlsInEmails({
  project_id,
  account_id,
}: {
  project_id: string;
  account_id: string;
}) {
  return (
    (await is_paying_customer(db(), account_id)) ||
    (await project_has_network_access(db(), project_id))
  );
}

export async function inviteCollaborator({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    project_id: string;
    account_id: string;
    title?: string;
    link2proj?: string;
    replyto?: string;
    replyto_name?: string;
    email?: string;
    subject?: string;
  };
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
    throw Error("user must be a collaborator");
  }
  const dbg = (...args: any[]) => logger.debug("inviteCollaborator", ...args);
  const database = db();

  // Check manage_users_owner_only setting before inviting
  await ensureCanManageCollaborators({
    project_id: opts.project_id,
    account_id,
  });

  // Actually add user to project
  await callback2(database.add_user_to_project, {
    project_id: opts.project_id,
    account_id: opts.account_id,
    group: "collaborator", // in future: "invite_collaborator"
  });

  const logInvite = async () =>
    await logInviteCollaboratorEvent({
      project_id: opts.project_id,
      actor_account_id: account_id,
      invitee_account_id: opts.account_id,
    });

  // Everything else in this big function is about notifying the user that they
  // were added.
  if (!opts.email) {
    await logInvite();
    return;
  }

  const email_address = await getEmailAddress(opts.account_id);
  if (!email_address) {
    await logInvite();
    return;
  }
  const when_sent = await callback2(database.when_sent_project_invite, {
    project_id: opts.project_id,
    to: email_address,
  });
  if (when_sent && when_sent >= days_ago(RESEND_INVITE_INTERVAL_DAYS)) {
    await logInvite();
    return;
  }
  const settings = await callback2(database.get_server_settings_cached);
  if (!settings) {
    await logInvite();
    return;
  }
  dbg(`send_email invite to ${email_address}`);
  let subject: string;
  if (opts.subject) {
    subject = opts.subject;
  } else if (opts.replyto_name) {
    subject = `${opts.replyto_name} invited you to collaborate on the project '${opts.title}'`;
  } else {
    subject = `Invitation for collaborating in the project '${opts.title}'`;
  }

  try {
    await callback2(send_invite_email, {
      to: email_address,
      subject,
      email: opts.email,
      email_address,
      title: opts.title,
      allow_urls: await allowUrlsInEmails({
        account_id,
        project_id: opts.project_id,
      }),
      replyto: opts.replyto ?? settings.organization_email,
      replyto_name: opts.replyto_name,
      link2proj: opts.link2proj,
      settings,
    });
  } catch (err) {
    dbg(`FAILED to send email to ${email_address}  -- ${err}`);
    await callback2(database.sent_project_invite, {
      project_id: opts.project_id,
      to: email_address,
      error: `${err}`,
    });
    throw err;
  }
  // Record successful send (without error):
  await callback2(database.sent_project_invite, {
    project_id: opts.project_id,
    to: email_address,
    error: undefined,
  });

  await logInvite();
}

export async function inviteCollaboratorWithoutAccount({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    project_id: string;
    title: string;
    link2proj: string;
    replyto?: string;
    replyto_name?: string;
    to: string;
    email: string; // body in HTML format
    subject?: string;
  };
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
    throw Error("user must be a collaborator");
  }
  const dbg = (...args: any[]) =>
    logger.debug("inviteCollaboratorWithoutAccount", ...args);
  const database = db();

  // Check manage_users_owner_only setting before inviting
  await ensureCanManageCollaborators({
    project_id: opts.project_id,
    account_id,
  });

  if (opts.to.length > 1024) {
    throw Error(
      "Specify less recipients when adding collaborators to project.",
    );
  }

  // Prepare list of recipients
  const to: string[] = opts.to
    .replace(/\s/g, ",")
    .replace(/;/g, ",")
    .split(",")
    .filter((x) => x);

  // Helper for inviting one user by email
  const invite_user = async (email_address: string) => {
    dbg(`inviting ${email_address}`);
    if (!is_valid_email_address(email_address)) {
      throw Error(`invalid email address '${email_address}'`);
    }
    email_address = lower_email_address(email_address);
    if (email_address.length >= 128) {
      throw Error(
        `email address must be at most 128 characters: '${email_address}'`,
      );
    }

    // 1. Already have an account?
    const to_account_id = await callback2(database.account_exists, {
      email_address,
    });

    // 2. If user exists, add to project; otherwise, trigger later add
    if (to_account_id) {
      dbg(`user ${email_address} already has an account -- add directly`);
      await callback2(database.add_user_to_project, {
        project_id: opts.project_id,
        account_id: to_account_id,
        group: "collaborator",
      });
    } else {
      dbg(
        `user ${email_address} doesn't have an account yet -- may send email (if we haven't recently)`,
      );
      await callback2(database.account_creation_actions, {
        email_address,
        action: {
          action: "add_to_project",
          group: "collaborator",
          project_id: opts.project_id,
        },
        ttl: 60 * 60 * 24 * 14,
      });
    }

    // 3. Has email been sent recently?
    const when_sent = await callback2(database.when_sent_project_invite, {
      project_id: opts.project_id,
      to: email_address,
    });
    if (when_sent && when_sent >= days_ago(RESEND_INVITE_INTERVAL_DAYS)) {
      // recent email -- nothing more to do
      return;
    }

    // 4. Get settings
    const settings = await callback2(database.get_server_settings_cached);
    if (!settings) {
      return;
    }

    // 5. Send email

    // Compose subject
    const subject = opts.subject ? opts.subject : "CoCalc Invitation";

    dbg(`send_email invite to ${email_address}`);
    try {
      await callback2(send_invite_email, {
        to: email_address,
        subject,
        email: opts.email,
        email_address,
        title: opts.title,
        allow_urls: await allowUrlsInEmails({
          account_id,
          project_id: opts.project_id,
        }),
        replyto: opts.replyto ?? settings.organization_email,
        replyto_name: opts.replyto_name,
        link2proj: opts.link2proj,
        settings,
      });
    } catch (err) {
      dbg(`FAILED to send email to ${email_address}  -- err=${err}`);
      await callback2(database.sent_project_invite, {
        project_id: opts.project_id,
        to: email_address,
        error: `${err}`,
      });
      throw err;
    }
    // Record successful send (without error):
    await callback2(database.sent_project_invite, {
      project_id: opts.project_id,
      to: email_address,
      error: undefined,
    });
  };

  // If any invite_user throws, its an error
  await Promise.all(to.map((email) => invite_user(email)));

  await logInviteNonuserEvent({
    project_id: opts.project_id,
    actor_account_id: account_id,
    invitee_email: opts.to,
  });
}
