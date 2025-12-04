/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { callback2 } from "@cocalc/util/async-utils";
import { uuid } from "@cocalc/util/misc";
import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import createAccount from "@cocalc/server/accounts/create-account";
import createProject from "@cocalc/server/projects/create";
import {
  addCollaborator,
  removeCollaborator,
} from "@cocalc/server/projects/collaborators";
import { resetServerSettingsCache } from "@cocalc/database/settings/server-settings";

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
  let projectId: string;

  beforeAll(async () => {
    await setSiteStrictCollab("no");

    await createAccount({
      email: `owner-${ownerId}@example.com`,
      password: "pass",
      firstName: "Owner",
      lastName: "One",
      account_id: ownerId,
    });
    await createAccount({
      email: `collab-${collaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Two",
      account_id: collaboratorId,
    });
    await createAccount({
      email: `collab-${collaboratorToRemove}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Three",
      account_id: collaboratorToRemove,
    });
    await createAccount({
      email: `collab-${newCollaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Four",
      account_id: newCollaboratorId,
    });

    projectId = await createProject({
      account_id: ownerId,
      title: "Default setting test",
    });

    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorToRemove },
    });
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
});

describe("strict collaborator management site setting", () => {
  const ownerId = uuid();
  const collaboratorId = uuid();
  const otherCollaboratorId = uuid();
  const newCollaboratorId = uuid();
  let projectId: string;

  beforeAll(async () => {
    await setSiteStrictCollab("yes");

    await createAccount({
      email: `owner-${ownerId}@example.com`,
      password: "pass",
      firstName: "Owner",
      lastName: "One",
      account_id: ownerId,
    });
    await createAccount({
      email: `collab-${collaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Two",
      account_id: collaboratorId,
    });
    await createAccount({
      email: `collab-${otherCollaboratorId}@example.com`,
      password: "pass",
      firstName: "Collab",
      lastName: "Three",
      account_id: otherCollaboratorId,
    });

    projectId = await createProject({
      account_id: ownerId,
      title: "Strict setting test",
    });

    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: collaboratorId },
    });
    await addCollaborator({
      account_id: ownerId,
      opts: { project_id: projectId, account_id: otherCollaboratorId },
    });
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
});
