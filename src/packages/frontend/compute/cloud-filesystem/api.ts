import type {
  CreateCloudFilesystem,
  CloudFilesystem,
  EditCloudFilesystem,
} from "@cocalc/util/db-schema/cloud-filesystems";

const CLOUD_FILESYSTEMS_REMOVED_MESSAGE =
  "Cloud filesystems have been removed from CoCalc.";

export async function createCloudFilesystem(
  _opts: CreateCloudFilesystem,
): Promise<number> {
  void _opts;
  throw new Error(CLOUD_FILESYSTEMS_REMOVED_MESSAGE);
}

export async function deleteCloudFilesystem({
  id: _id,
  lock: _lock,
}: {
  id: number;
  lock: string;
}): Promise<void> {
  void _id;
  void _lock;
  throw new Error(CLOUD_FILESYSTEMS_REMOVED_MESSAGE);
}

export async function editCloudFilesystem(
  _opts: EditCloudFilesystem,
): Promise<void> {
  void _opts;
  throw new Error(CLOUD_FILESYSTEMS_REMOVED_MESSAGE);
}

export async function getCloudFilesystems(
  // give no options to get all file systems that YOU own across all your projects
  _opts: {
    // id = specific on
    id?: number;
    // project_id = all in a given project (owned by anybody)
    project_id?: string;
    // if true, use cache and potentially return stale data (good for repeated calls in a list, etc.)
    cache?: boolean;
  } = {},
): Promise<CloudFilesystem[]> {
  void _opts;
  throw new Error(CLOUD_FILESYSTEMS_REMOVED_MESSAGE);
}

export async function getMetrics({
  id: _id,
  limit: _limit,
  offset: _offset,
}: {
  id: number;
  limit?: number;
  offset?: number;
}) {
  void _id;
  void _limit;
  void _offset;
  throw new Error(CLOUD_FILESYSTEMS_REMOVED_MESSAGE);
}
