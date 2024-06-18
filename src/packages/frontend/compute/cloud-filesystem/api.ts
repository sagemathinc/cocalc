import api from "@cocalc/frontend/client/api";

import type {
  CreateCloudFilesystem,
  CloudFilesystem,
  EditCloudFilesystem,
} from "@cocalc/util/db-schema/cloud-filesystems";
import {
  CHANGE_MOUNTED,
  CHANGE_UNMOUNTED,
} from "@cocalc/util/db-schema/cloud-filesystems";

export async function createCloudFilesystem(
  opts: CreateCloudFilesystem,
): Promise<number> {
  return await api("compute/cloud-filesystem/create", opts);
}

export async function deleteCloudFilesystem({
  id,
  lock,
}: {
  id: number;
  lock: string;
}): Promise<void> {
  await api("compute/cloud-filesystem/delete", { id, lock });
}

export async function editCloudFilesystem(
  opts: EditCloudFilesystem,
): Promise<void> {
  for (const field in opts) {
    if (field == "id") {
      continue;
    }
    if (!CHANGE_MOUNTED.has(field) && !CHANGE_UNMOUNTED.has(field)) {
      throw Error(`invalid field '${field}' for edit`);
    }
  }
  return await api("compute/cloud-filesystem/edit", opts);
}

export async function getCloudFilesystems(
  // give no options to get all filesystems that YOU own across all your projects
  opts: {
    // id = specific on
    id?: number;
    // project_id = all in a given project (owned by anybody)
    project_id?: string;
  } = {},
): Promise<CloudFilesystem[]> {
  return await api("compute/cloud-filesystem/get", opts);
}

export async function getMetrics({
  id,
  limit,
  offset,
}: {
  id: number;
  limit?: number;
  offset?: number;
}) {
  return await api("compute/cloud-filesystem/get-metrics", {
    cloud_filesystem_id: id,
    limit,
    offset,
  });
}
