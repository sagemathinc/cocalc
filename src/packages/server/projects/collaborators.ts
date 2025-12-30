/*
Add, remove and invite collaborators on projects.
*/

import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import type { AddCollaborator } from "@cocalc/conat/hub/api/projects";
import { add_collaborators_to_projects } from "./collab";
import {
  days_ago,
  is_array,
  is_valid_email_address,
  lower_email_address,
} from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import { send_invite_email } from "@cocalc/server/hub/email";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import { is_paying_customer } from "@cocalc/database/postgres/account/queries";
import { project_has_network_access } from "@cocalc/database/postgres/project/queries";
import { RESEND_INVITE_INTERVAL_DAYS } from "@cocalc/util/consts/invites";

const logger = getLogger("project:collaborators");

export async function removeCollaborator({
  account_id,
  opts,
}: {
  account_id: string;
  opts: {
    account_id;
    project_id;
  };
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id: opts.project_id }))) {
    throw Error("user must be a collaborator");
  }
  // @ts-ignore
  await callback2(db().remove_collaborator_from_project, opts);
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

  await add_collaborators_to_projects(
    db(),
    account_id,
    accounts as string[],
    projects as string[],
    tokens as string[] | undefined,
  );
  // Tokens determine the projects, and it may be useful to the client to know what
  // project they just got added to!
  let project_id;
  if (is_single_token) {
    project_id = projects[0];
  } else {
    project_id = projects;
  }
  return { project_id };
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
  const dbg = (...args) => logger.debug("inviteCollaborator", ...args);
  const database = db();

  // Actually add user to project
  await callback2(database.add_user_to_project, {
    project_id: opts.project_id,
    account_id: opts.account_id,
    group: "collaborator", // in future: "invite_collaborator"
  });

  // Everything else in this big function is about notifying the user that they
  // were added.
  if (!opts.email) {
    return;
  }

  const email_address = await getEmailAddress(opts.account_id);
  if (!email_address) {
    return;
  }
  const when_sent = await callback2(database.when_sent_project_invite, {
    project_id: opts.project_id,
    to: email_address,
  });
  if (when_sent && when_sent >= days_ago(RESEND_INVITE_INTERVAL_DAYS)) {
    return;
  }
  const settings = await callback2(database.get_server_settings_cached);
  if (!settings) {
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
  const dbg = (...args) =>
    logger.debug("inviteCollaboratorWithoutAccount", ...args);
  const database = db();

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
}
