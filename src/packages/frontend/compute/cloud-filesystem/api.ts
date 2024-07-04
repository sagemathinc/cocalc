import api from "@cocalc/frontend/client/api";
import LRU from "lru-cache";
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

const cloudFilesystemCache = new LRU<string, CloudFilesystem[]>({
  max: 100,
  ttl: 1000 * 30,
});

export async function getCloudFilesystems(
  // give no options to get all file systems that YOU own across all your projects
  opts: {
    // id = specific on
    id?: number;
    // project_id = all in a given project (owned by anybody)
    project_id?: string;
    // if true, use cache and potentially return stale data (good for repeated calls in a list, etc.)
    cache?: boolean;
  } = {},
): Promise<CloudFilesystem[]> {
  const key = `${opts.id}${opts.project_id}`;
  if (opts.cache && cloudFilesystemCache.has(key)) {
    return cloudFilesystemCache.get(key)!;
  }
  const filesystems = await api("compute/cloud-filesystem/get", {
    id: opts.id,
    project_id: opts.project_id,
  });
  // always save in cache
  cloudFilesystemCache.set(key, filesystems);
  return filesystems;
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
