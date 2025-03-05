import { context } from "./config";
import { isValidUUID } from "@cocalc/util/misc";

export const OWNER_TYPES = ["account", "project", "group"] as const;

export const OWNER_ID_FIELDS = OWNER_TYPES.map((x) => x + "_id");

export type OwnerType = (typeof OWNER_TYPES)[number];

export interface FilesystemPrimaryKey {
  // The primary key (namespace, owner_type, owner_id, name):

  namespace: string;
  // we support two types of filesystems:
  //   - 'project': owned by one project and can be used in various context associated with a single project;
  //     useful to all collaborators on a project.
  //   - 'account': owned by a user (a person) and be used in various ways on all projects they collaborator on.
  // Other than the above distinction, the filesystems are treated identically by the server.
  owner_type: OwnerType;
  // owner_id is either a project_id or an account_id or an group_id.
  owner_id: string;
  // The name of the filesystem.
  name: string;
}

// This isn't exactly a FilesystemPrimaryKey, but it is convenient to
// work with and it uniquely *defines* one (or throws an error), after
// being fed through the primaryKey function below.
export interface PrimaryKey {
  namespace?: string;
  owner_type?: OwnerType;
  owner_id?: string;
  name?: string;
  account_id?: string;
  project_id?: string;
  group_id?: string;
}

const zfsSegmentRegex = /^[a-zA-Z0-9 _\-.:]+$/;

export function primaryKey({
  namespace = context.namespace,
  owner_type,
  owner_id,
  name,
  account_id,
  project_id,
  group_id,
}: PrimaryKey): FilesystemPrimaryKey {
  if (
    (account_id ? 1 : 0) +
      (project_id ? 1 : 0) +
      (group_id ? 1 : 0) +
      (owner_type ? 1 : 0) !=
    1
  ) {
    throw Error(
      `exactly one of account_id, project_id, group_id, or owner_type must be specified: ${JSON.stringify({ account_id, project_id, group_id, owner_type })}`,
    );
  }
  if (
    (account_id ? 1 : 0) +
      (project_id ? 1 : 0) +
      (group_id ? 1 : 0) +
      (owner_id ? 1 : 0) !=
    1
  ) {
    throw Error(
      `exactly one of account_id, project_id, group_id, or owner_type must be specified: ${JSON.stringify({ account_id, project_id, group_id, owner_id })}`,
    );
  }
  if (account_id) {
    owner_type = "account";
    owner_id = account_id;
  } else if (project_id) {
    owner_type = "project";
    owner_id = project_id;
  } else if (group_id) {
    owner_type = "group";
    owner_id = group_id;
  }
  if (!owner_type || !OWNER_TYPES.includes(owner_type)) {
    throw Error(
      `unknown owner type '${owner_type}' -- must be one of ${JSON.stringify(OWNER_TYPES)}`,
    );
  }
  if (!name) {
    if (owner_type == "project" && name == null) {
      // the home directory of a project.
      name = "home";
    } else {
      throw Error("name must be nonempty");
    }
  }
  if (name.length >= 64) {
    // this is only so mounting is reasonable on the filesystem... and could be lifted
    throw Error("name must be at most 63 characters");
  }
  if (!zfsSegmentRegex.test(name)) {
    throw Error(
      'name must only contain alphanumeric characters, space, *, "-", "_", "." and ":"',
    );
  }

  if (!isValidUUID(owner_id) || !owner_id) {
    throw Error("owner_id must be a valid uuid");
  }

  return { namespace, owner_type, owner_id, name };
}

export interface Filesystem extends FilesystemPrimaryKey {
  // Properties of the filesystem and its current state:

  // the pool is where the filesystem happened to get allocated.  This can be influenced by affinity or usage.
  pool: string;
  // true if project is currently archived
  archived: boolean;
  // array of hosts (or range using CIDR notation) that we're
  // granting NFS client access to.
  nfs: string[];
  // list of snapshots as ISO timestamps from oldest to newest
  snapshots: string[];
  // name of the most recent snapshot that was used for sending a stream
  // (for incremental backups). This specified snapshot will never be
  // deleted by the snapshot trimming process, until a newer send snapshot is made.
  last_send_snapshot?: string;
  // name of most recent bup backup
  last_bup_backup?: string;
  // Last_edited = last time this project was "edited" -- various
  // operations cause this to get updated.
  last_edited?: Date;
  // optional arbitrary affinity string - we attempt if possible to put
  // projects with the same affinity in the same pool, to improve chances of dedup.
  affinity?: string;
  // if this is set, then some sort of error that "should" never happen,
  // has happened, and manual intervention is needed.
  error?: string;
  // when the last error actually happened
  last_error?: Date;

  // Bytes used by the main project filesystem dataset, NOT counting snapshots (zfs "USED").
  // Obviously these used_by fields are NOT always up to date.  They get updated on some
  // standard operations, including making snapshots, so can be pretty useful for monitoring
  // for issues, etc.
  used_by_dataset?: number;
  // Total amount of space used by snapshots (not the filesystem)
  used_by_snapshots?: number;

  // Quota for dataset usage (in bytes), so used_by_dataset <= dataset_quota. This is the refquota property in ZFS.
  quota?: number;
}

// Used for set(...), main thing being each field can be FilesystemFieldFunction,
// which makes it very easy to *safely* mutate data (assuming only one process
// is using sqlite).
type FilesystemFieldFunction = (project: Filesystem) => any;
export interface SetFilesystem extends PrimaryKey {
  pool?: string | FilesystemFieldFunction;
  archived?: boolean | FilesystemFieldFunction;
  nfs?: string[] | FilesystemFieldFunction;
  snapshots?: string[] | FilesystemFieldFunction;
  last_send_snapshot?: string | FilesystemFieldFunction;
  last_bup_backup?: string | FilesystemFieldFunction;
  last_edited?: Date | FilesystemFieldFunction;
  affinity?: null | string | FilesystemFieldFunction;
  error?: null | string | FilesystemFieldFunction;
  last_error?: Date | FilesystemFieldFunction;
  used_by_dataset?: null | number;
  used_by_snapshots?: null | number;
  quota?: null | number;
}

// what is *actually* stored in sqlite
export interface RawFilesystem {
  owner_type: OwnerType;
  owner_id: string;
  namespace: string;
  pool: string;
  // 0 or 1
  archived?: number;
  // nfs and snasphots are v.join(',')
  nfs?: string;
  snapshots?: string;
  last_send_snapshot?: string;
  last_bup_backup?: string;
  // new Date().ISOString()
  last_edited?: string;
  affinity?: string;
  error?: string;
  last_error?: string;
  used_by_dataset?: number;
  used_by_snapshots?: number;
  quota?: number;
}
