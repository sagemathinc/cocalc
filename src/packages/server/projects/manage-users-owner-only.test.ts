/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { resetServerSettingsCache } from "@cocalc/database/settings/server-settings";
import userQuery from "@cocalc/database/user-query";
import createAccount from "@cocalc/server/accounts/create-account";
import {
  addCollaborator,
  changeUserType,
  removeCollaborator,
} from "@cocalc/server/projects/collaborators";
import createProject from "@cocalc/server/projects/create";
import { callback2 } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";

async function setSiteStrictCollab(value: "yes" | "no") {
  await callback2(db().set_server_setting, {
    name: "strict_collaborator_management",
    value,
    readonly: false,
  });
  resetServerSettingsCache();
}

beforeAll(async () => {
  await initEphemeralDatabase();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("without site enforcement (default)", () => {
  const ownerId = uuid();
  const collaboratorId = uuid();
  const collaboratorToRemove = uuid();
  const newCollaboratorId = uuid();
  const ownerCollaboratorId = uuid();
  let projectId: string;

  beforeAll(async () => {
    await setSiteStrictCollab("no");

    await createAccount({
      email: `owner-${ownerId}@example.com`,
      password: "pass",
      firstName: "Owner",
      lastName: "One",
      account_id: ownerId,
      noFirstProject: true,
    });
    await createAccount({
      email: `collab-${collaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Two",
      account_id: collaboratorId,
      noFirstProject: true,
    });
    await createAccount({
      email: `collab-${collaboratorToRemove}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Three",
      account_id: collaboratorToRemove,
      noFirstProject: true,
    });
    await createAccount({
      email: `collab-${newCollaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Four",
      account_id: newCollaboratorId,
      noFirstProject: true,
    });
    await createAccount({
      email: `owner-collab-${ownerCollaboratorId}@example.com`,
      password: "pass",
      firstName: "Owner",
      lastName: "Collab",
      account_id: ownerCollaboratorId,
      noFirstProject: true,
    });

    projectId = await createProject({
      account_id: ownerId,
      title: "Default setting test",
      start: false,
    });

    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorToRemove },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: ownerCollaboratorId },
    });

    // Promote ownerCollaboratorId to owner
    await changeUserType({
      account_id: ownerId,
      opts: {
        project_id: projectId,
        target_account_id: ownerCollaboratorId,
        new_group: "owner",
      },
    });

    // Verify they are actually an owner
    const { rows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(rows[0].users[ownerCollaboratorId]).toEqual({ group: "owner" });
  });

  test("collaborator can add collaborators when site enforcement is off", async () => {
    await expect(
      addCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: newCollaboratorId },
      }),
    ).resolves.toBeDefined();

    const { rows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(rows[0].users[newCollaboratorId]).toEqual({ group: "collaborator" });
  });

  test("collaborator can remove another collaborator when site enforcement is off", async () => {
    await expect(
      removeCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: collaboratorToRemove },
      }),
    ).resolves.toBeUndefined();

    const { rows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(rows[0].users[collaboratorToRemove]).toBeUndefined();
  });

  test("collaborator cannot remove another owner collaborator when site enforcement is off", async () => {
    await expect(
      removeCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: ownerCollaboratorId },
      }),
    ).rejects.toThrow("Cannot remove an owner. Demote to collaborator first.");
  });
});

describe("strict collaborator management site setting", () => {
  const ownerId = uuid();
  const collaboratorId = uuid();
  const otherCollaboratorId = uuid();
  const newCollaboratorId = uuid();
  const ownerCollaboratorId = uuid();
  const collaboratorToRemoveByOwner = uuid();
  let projectId: string;

  beforeAll(async () => {
    await setSiteStrictCollab("yes");

    await createAccount({
      email: `owner-${ownerId}@example.com`,
      password: "pass",
      firstName: "Owner",
      lastName: "One",
      account_id: ownerId,
      noFirstProject: true,
    });
    await createAccount({
      email: `collab-${collaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Two",
      account_id: collaboratorId,
      noFirstProject: true,
    });
    await createAccount({
      email: `collab-${otherCollaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Three",
      account_id: otherCollaboratorId,
      noFirstProject: true,
    });
    await createAccount({
      email: `owner-collab-${ownerCollaboratorId}@example.com`,
      password: "pass",
      firstName: "Owner",
      lastName: "Collab",
      account_id: ownerCollaboratorId,
      noFirstProject: true,
    });
    await createAccount({
      email: `collab-remove-${collaboratorToRemoveByOwner}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "ToRemove",
      account_id: collaboratorToRemoveByOwner,
      noFirstProject: true,
    });

    projectId = await createProject({
      account_id: ownerId,
      title: "Strict setting test",
      start: false,
    });

    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: otherCollaboratorId },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: ownerCollaboratorId },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorToRemoveByOwner },
    });

    // Promote ownerCollaboratorId to owner
    await changeUserType({
      account_id: ownerId,
      opts: {
        project_id: projectId,
        target_account_id: ownerCollaboratorId,
        new_group: "owner",
      },
    });

    // Verify they are actually an owner
    const { rows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(rows[0].users[ownerCollaboratorId]).toEqual({ group: "owner" });
  });

  test("owner can still add collaborators when site enforcement is on", async () => {
    await expect(
      addCollaborator({
        account_id: ownerId,
        opts: { project_id: projectId, account_id: newCollaboratorId },
      }),
    ).resolves.toBeDefined();
  });

  test("collaborator cannot add collaborators when site enforcement is on", async () => {
    await expect(
      addCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: uuid() },
      }),
    ).rejects.toThrow(
      "Only owners can manage collaborators when this setting is enabled",
    );
  });

  test("collaborator cannot remove another collaborator when site enforcement is on", async () => {
    await expect(
      removeCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: otherCollaboratorId },
      }),
    ).rejects.toThrow(
      "Only owners can manage collaborators when this setting is enabled",
    );
  });

  test("owner cannot disable manage_users_owner_only when site enforcement is on", async () => {
    await expect(
      userQuery({
        account_id: ownerId,
        query: {
          projects: {
            project_id: projectId,
            manage_users_owner_only: false,
          },
        },
      }),
    ).rejects.toMatch(
      "Collaborator management is enforced by the site administrator and cannot be disabled.",
    );
  });

  test("owner can remove non-owner collaborators when site enforcement is on", async () => {
    await expect(
      removeCollaborator({
        account_id: ownerId,
        opts: {
          project_id: projectId,
          account_id: collaboratorToRemoveByOwner,
        },
      }),
    ).resolves.toBeUndefined();

    const { rows } = await getPool().query(
      "SELECT users FROM projects WHERE project_id=$1",
      [projectId],
    );
    expect(rows[0].users[collaboratorToRemoveByOwner]).toBeUndefined();
  });

  test("collaborator cannot remove owner collaborator when site enforcement is on", async () => {
    await expect(
      removeCollaborator({
        account_id: collaboratorId,
        opts: { project_id: projectId, account_id: ownerCollaboratorId },
      }),
    ).rejects.toThrow("Cannot remove an owner. Demote to collaborator first.");
  });
});
