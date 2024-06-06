import api from "@cocalc/frontend/client/api";

import type {
  CreateCloudFilesystem,
  EditCloudFilesystem,
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
  return await api("compute/cloud-filesystem/edit", opts);
}

// DEV
// window.x = {
//   createCloudFilesystem,
//   deleteCloudFilesystem,
//   editCloudFilesystem,
// };
