import { client as fileServerClient } from "@cocalc/conat/files/file-server";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import { assertCollab } from "./util";

// NOTES about snapshots:

// TODO: in some cases we *might* only allow the project owner to delete snapshots
// create a new snapshot of a project

// just *some* limit to avoid bugs/abuse

const MAX_SNAPSHOTS_PER_PROJECT = 100;

export async function createSnapshot({
  account_id,
  project_id,
  name,
}: {
  account_id?: string;
  project_id: string;
  name?: string;
}) {
  await assertCollab({ account_id, project_id });
  await fileServerClient().createSnapshot({
    project_id,
    name,
    limit: MAX_SNAPSHOTS_PER_PROJECT,
  });
}

export async function deleteSnapshot({
  account_id,
  project_id,
  name,
}: {
  account_id?: string;
  project_id: string;
  name: string;
}) {
  await assertCollab({ account_id, project_id });
  await fileServerClient().deleteSnapshot({ project_id, name });
}

export async function updateSnapshots({
  account_id,
  project_id,
  counts,
}: {
  account_id?: string;
  project_id: string;
  counts?: Partial<SnapshotCounts>;
}) {
  await assertCollab({ account_id, project_id });
  await fileServerClient().updateSnapshots({
    project_id,
    counts,
    limit: MAX_SNAPSHOTS_PER_PROJECT,
  });
}

export async function getSnapshotQuota({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id: string;
}) {
  await assertCollab({ account_id, project_id });
  return { limit: MAX_SNAPSHOTS_PER_PROJECT };
}

export async function allSnapshotUsage({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id: string;
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient().allSnapshotUsage({
    project_id,
  });
}
