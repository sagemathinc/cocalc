/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { db } from "@cocalc/database";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import {
  addCollaborator,
  changeUserType,
  inviteCollaborator,
  inviteCollaboratorWithoutAccount,
  removeCollaborator,
} from "@cocalc/server/projects/collaborators";
import {
  resetServerSettingsCache,
  getServerSettings,
} from "@cocalc/database/settings/server-settings";
import { OwnershipErrorCode } from "@cocalc/util/project-ownership";

async function setSiteStrictCollab(value: "yes" | "no") {
  await callback2(db().set_server_setting, {
    name: "strict_collaborator_management",
    value,
    readonly: false,
  });
  resetServerSettingsCache();
  await getServerSettings(); // warm cache
}

beforeAll(async () => {
  await initEphemeralDatabase({ reset: true });
}, 15000);

afterAll(async () => {
  await getPool().end();
});

afterEach(async () => {
  await setSiteStrictCollab("no");
});

async function createUser(emailPrefix: string): Promise<string> {
  const account_id = uuid();
  await createAccount({
    email: `${emailPrefix}-${account_id}@example.com`,
    password: "pass",
    firstName: "Test",
    lastName: "User",
    account_id,
    noFirstProject: true,
  });
  return account_id;
}

async function createProjectWithOwner(): Promise<{
  ownerId: string;
  projectId: string;
}> {
  const ownerId = await createUser("owner");
  const projectId = await createProject({
    account_id: ownerId,
    title: "Ownership test project",
    start: false,
  });
  return { ownerId, projectId };
}

describe("changeUserType validations", () => {
  test("owner can promote collaborator to owner", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });

    await expect(
      changeUserType({
        account_id: ownerId,
        opts: {
          project_id: projectId,
          target_account_id: collaboratorId,
          new_group: "owner",
        },
      }),
    ).resolves.toBeUndefined();

    const { rows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(rows[0].users[collaboratorId].group).toBe("owner");
  });

  test("owner can demote another owner when not last owner", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const secondOwnerId = await createUser("owner");
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: secondOwnerId },
    });
    await changeUserType({
      account_id: ownerId,
      opts: {
        project_id: projectId,
        target_account_id: secondOwnerId,
        new_group: "owner",
      },
    });

    await expect(
      changeUserType({
        account_id: ownerId,
        opts: {
          project_id: projectId,
          target_account_id: secondOwnerId,
          new_group: "collaborator",
        },
      }),
    ).resolves.toBeUndefined();

    const { rows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(rows[0].users[secondOwnerId].group).toBe("collaborator");
  });

  test("cannot demote last owner", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    await expect(
      changeUserType({
        account_id: ownerId,
        opts: {
          project_id: projectId,
          target_account_id: ownerId,
          new_group: "collaborator",
        },
      }),
    ).rejects.toMatchObject({ code: OwnershipErrorCode.LAST_OWNER });
  });

  test("collaborator cannot change user types", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });

    await expect(
      changeUserType({
        account_id: collaboratorId,
        opts: {
          project_id: projectId,
          target_account_id: ownerId,
          new_group: "collaborator",
        },
      }),
    ).rejects.toMatchObject({ code: OwnershipErrorCode.NOT_OWNER });
  });

  test("project not found throws invalid project state", async () => {
    const accountId = await createUser("owner");
    await expect(
      changeUserType({
        account_id: accountId,
        opts: {
          project_id: uuid(),
          target_account_id: uuid(),
          new_group: "owner",
        },
      }),
    ).rejects.toMatchObject({
      code: OwnershipErrorCode.INVALID_REQUESTING_USER,
    });
  });

  test("target not in project throws invalid user", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    await expect(
      changeUserType({
        account_id: ownerId,
        opts: {
          project_id: projectId,
          target_account_id: uuid(),
          new_group: "owner",
        },
      }),
    ).rejects.toMatchObject({ code: OwnershipErrorCode.INVALID_USER });
  });
});

describe("removal rules", () => {
  test("self removal allowed when manage_users_owner_only is true", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await getPool().query(
      "UPDATE projects SET manage_users_owner_only=$1 WHERE project_id=$2",
      [true, projectId],
    );

    await expect(
      removeCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: collaboratorId },
      }),
    ).resolves.toBeUndefined();
  });

  test("cannot remove an owner", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    await expect(
      removeCollaborator({
        account_id: ownerId,
        opts: { project_id: projectId, account_id: ownerId },
      }),
    ).rejects.toMatchObject({ code: OwnershipErrorCode.CANNOT_REMOVE_OWNER });
  });
});

describe("site setting override", () => {
  test("site strict setting overrides project flag", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    const otherCollabId = await createUser("collab");
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: otherCollabId },
    });
    await getPool().query(
      "UPDATE projects SET manage_users_owner_only=$1 WHERE project_id=$2",
      [false, projectId],
    );
    await setSiteStrictCollab("yes");

    await expect(
      removeCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: otherCollabId },
      }),
    ).rejects.toMatchObject({ code: OwnershipErrorCode.NOT_OWNER });
  });
});

describe("invite permissions", () => {
  test("owner can invite when manage_users_owner_only is true", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const inviteeId = await createUser("invitee");
    await getPool().query(
      "UPDATE projects SET manage_users_owner_only=$1 WHERE project_id=$2",
      [true, projectId],
    );

    await expect(
      inviteCollaborator({
        account_id: ownerId,
        opts: { project_id: projectId, account_id: inviteeId },
      }),
    ).resolves.toBeUndefined();
  });

  test("collaborator cannot invite when manage_users_owner_only is true", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    const inviteeId = await createUser("invitee");
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await getPool().query(
      "UPDATE projects SET manage_users_owner_only=$1 WHERE project_id=$2",
      [true, projectId],
    );

    await expect(
      inviteCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: inviteeId },
      }),
    ).rejects.toMatchObject({ code: OwnershipErrorCode.NOT_OWNER });
  });

  test("collaborator cannot invite non-user when manage_users_owner_only is true", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await getPool().query(
      "UPDATE projects SET manage_users_owner_only=$1 WHERE project_id=$2",
      [true, projectId],
    );

    await expect(
      inviteCollaboratorWithoutAccount({
        account_id: collaboratorId,
        opts: {
          project_id: projectId,
          email: "newuser@example.com",
          title: "Invite",
          link2proj: "",
          to: "newuser@example.com",
        },
      }),
    ).rejects.toMatchObject({ code: OwnershipErrorCode.NOT_OWNER });
  });
});
