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
  add_collaborators_to_projects,
  remove_collaborators_from_projects,
} from "@cocalc/server/projects/collab";
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

describe("REST API level protection (collab.ts functions)", () => {
  test("add_collaborators_to_projects bypasses check when using tokens", async () => {
    const { projectId } = await createProjectWithOwner();
    const outsideUserId = await createUser("outsider");

    // Create a project invite token
    const { rows } = await getPool().query(
      "INSERT INTO project_invite_tokens (token, project_id, usage_limit) VALUES ($1, $2, $3) RETURNING token",
      ["test-token-123", projectId, 10],
    );
    const token = rows[0].token;

    // Enable site-wide strict collaborator management
    await setSiteStrictCollab("yes");

    // Outside user should be able to add themselves using a token
    // even though they're not a collaborator or owner
    await expect(
      add_collaborators_to_projects(
        db(),
        outsideUserId,
        [outsideUserId],
        [""], // empty project_id because token determines the project
        [token],
      ),
    ).resolves.toBeUndefined();

    // Verify the user was actually added
    const { rows: projectRows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(projectRows[0].users[outsideUserId]).toBeDefined();
  });

  test("add_collaborators_to_projects enforces strict_collaborator_management site setting", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    const newCollabId = await createUser("newcollab");

    // Add first collaborator as owner
    await add_collaborators_to_projects(
      db(),
      ownerId,
      [collaboratorId],
      [projectId],
    );

    // Enable site-wide strict collaborator management
    await setSiteStrictCollab("yes");

    // Collaborator should not be able to add another user
    await expect(
      add_collaborators_to_projects(
        db(),
        collaboratorId,
        [newCollabId],
        [projectId],
      ),
    ).rejects.toThrow("Only owners can manage collaborators");
  });

  test("add_collaborators_to_projects enforces project-level manage_users_owner_only", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");
    const newCollabId = await createUser("newcollab");

    // Add first collaborator as owner
    await add_collaborators_to_projects(
      db(),
      ownerId,
      [collaboratorId],
      [projectId],
    );

    // Enable project-level strict management
    await getPool().query(
      "UPDATE projects SET manage_users_owner_only=$1 WHERE project_id=$2",
      [true, projectId],
    );

    // Collaborator should not be able to add another user
    await expect(
      add_collaborators_to_projects(
        db(),
        collaboratorId,
        [newCollabId],
        [projectId],
      ),
    ).rejects.toThrow("Only owners can manage collaborators");
  });

  test("remove_collaborators_from_projects enforces strict_collaborator_management site setting", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaborator1Id = await createUser("collab1");
    const collaborator2Id = await createUser("collab2");

    // Add collaborators as owner
    await add_collaborators_to_projects(
      db(),
      ownerId,
      [collaborator1Id, collaborator2Id],
      [projectId, projectId],
    );

    // Enable site-wide strict collaborator management
    await setSiteStrictCollab("yes");

    // Collaborator should not be able to remove another collaborator
    await expect(
      remove_collaborators_from_projects(
        db(),
        collaborator1Id,
        [collaborator2Id],
        [projectId],
      ),
    ).rejects.toThrow("Only owners can manage collaborators");
  });

  test("remove_collaborators_from_projects allows self-removal even with strict_collaborator_management", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");

    // Add collaborator as owner
    await add_collaborators_to_projects(
      db(),
      ownerId,
      [collaboratorId],
      [projectId],
    );

    // Enable site-wide strict collaborator management
    await setSiteStrictCollab("yes");

    // Collaborator should be able to remove themselves
    await expect(
      remove_collaborators_from_projects(
        db(),
        collaboratorId,
        [collaboratorId],
        [projectId],
      ),
    ).resolves.toBeUndefined();
  });

  test("remove_collaborators_from_projects enforces project-level manage_users_owner_only", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaborator1Id = await createUser("collab1");
    const collaborator2Id = await createUser("collab2");

    // Add collaborators as owner
    await add_collaborators_to_projects(
      db(),
      ownerId,
      [collaborator1Id, collaborator2Id],
      [projectId, projectId],
    );

    // Enable project-level strict management
    await getPool().query(
      "UPDATE projects SET manage_users_owner_only=$1 WHERE project_id=$2",
      [true, projectId],
    );

    // Collaborator should not be able to remove another collaborator
    await expect(
      remove_collaborators_from_projects(
        db(),
        collaborator1Id,
        [collaborator2Id],
        [projectId],
      ),
    ).rejects.toThrow("Only owners can manage collaborators");
  });

  test("add_collaborators_to_projects allows owners to add when strict management is enabled", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const newCollabId = await createUser("newcollab");

    // Enable site-wide strict collaborator management
    await setSiteStrictCollab("yes");

    // Owner should be able to add a collaborator
    await expect(
      add_collaborators_to_projects(db(), ownerId, [newCollabId], [projectId]),
    ).resolves.toBeUndefined();
  });

  test("remove_collaborators_from_projects allows owners to remove when strict management is enabled", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const collaboratorId = await createUser("collab");

    // Add collaborator
    await add_collaborators_to_projects(
      db(),
      ownerId,
      [collaboratorId],
      [projectId],
    );

    // Enable site-wide strict collaborator management
    await setSiteStrictCollab("yes");

    // Owner should be able to remove a collaborator
    await expect(
      remove_collaborators_from_projects(
        db(),
        ownerId,
        [collaboratorId],
        [projectId],
      ),
    ).resolves.toBeUndefined();
  });

  test("remove_collaborators_from_projects blocks removing owners", async () => {
    const { ownerId, projectId } = await createProjectWithOwner();
    const secondOwnerId = await createUser("owner2");

    // Add second owner
    await add_collaborators_to_projects(
      db(),
      ownerId,
      [secondOwnerId],
      [projectId],
    );
    await changeUserType({
      account_id: ownerId,
      opts: {
        project_id: projectId,
        target_account_id: secondOwnerId,
        new_group: "owner",
      },
    });

    // Even the first owner should not be able to directly remove the second owner -- owners have to demote to collaborator first
    await expect(
      remove_collaborators_from_projects(
        db(),
        ownerId,
        [secondOwnerId],
        [projectId],
      ),
    ).rejects.toThrow("Cannot remove an owner");
  });
});
