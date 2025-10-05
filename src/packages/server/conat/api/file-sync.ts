/*
Current permissions model:

src and dest must be of this form
    project-{project_id}:{path}
with account_id a collab on project_id.

There's one exception, which is when *deleting* a sync, the account_id only
has to be a collab on one or other of of src or dest.

*/

import { type Sync } from "@cocalc/conat/files/file-server";
import { type MutagenSyncSession } from "@cocalc/conat/project/mutagen/types";
import { assertCollab } from "./util";
import { client as fileServerClient } from "@cocalc/conat/files/file-server";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

function getProjectId(spec: string): string {
  const name = spec.split(":")[0];
  if (!name.startsWith("project-")) {
    throw Error("volume name must start with project-");
  }
  const project_id = name.slice("project-".length);
  if (!isValidUUID(project_id)) {
    throw Error(`volume name must be of the form project-{valid uuid v4}`);
  }
  return project_id;
}

async function check({
  src,
  dest,
  account_id,
  onlyOne,
}: Sync & { account_id: string } & { onlyOne?: boolean }) {
  const project_id0 = getProjectId(src);
  const project_id1 = getProjectId(dest);
  if (!onlyOne) {
    await assertCollab({ project_id: project_id0, account_id });
    await assertCollab({ project_id: project_id1, account_id });
    return;
  }
  if (
    (await isCollaborator({ project_id: project_id0, account_id })) ||
    (await isCollaborator({ project_id: project_id1, account_id }))
  ) {
    return;
  } else {
    throw Error("must be a collaborator on src or dest");
  }
}

export async function create(
  opts: Sync & { account_id: string },
): Promise<void> {
  await check(opts);
  await fileServerClient().createSync(opts);
}

async function delete0(opts: Sync & { account_id: string }): Promise<void> {
  await check({ ...opts, onlyOne: true });
  await fileServerClient().deleteSync(opts);
}
export { delete0 as delete };

export async function get(
  opts: Sync & { account_id: string },
): Promise<undefined | (MutagenSyncSession & Sync)> {
  await check(opts);
  return await fileServerClient().getSync(opts);
}

export async function pause(
  opts: Sync & { account_id: string },
): Promise<void> {
  await check(opts);
  await fileServerClient().pauseSync(opts);
}

export async function flush(
  opts: Sync & { account_id: string },
): Promise<void> {
  await check(opts);
  await fileServerClient().flushSync(opts);
}

export async function resume(
  opts: Sync & { account_id: string },
): Promise<void> {
  await check(opts);
  await fileServerClient().resumeSync(opts);
}

export async function getAll({
  name,
  account_id,
}: {
  name: string;
  account_id: string;
}): Promise<(MutagenSyncSession & Sync)[]> {
  const project_id = getProjectId(name + ":");
  await assertCollab({ project_id, account_id });
  return await fileServerClient().getAllSyncs({ name });
}
