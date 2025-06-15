import { join } from "path";
import { context } from "./config";
import { primaryKey, type PrimaryKey } from "./types";
import { randomId } from "@cocalc/conat/names";

export function databaseFilename(data: string) {
  return join(data, "database.sqlite3");
}

export function namespaceDataset({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  return `${pool}/${namespace}`;
}

// Archives
// There is one single dataset for each namespace/pool pair: All the different
// archives across filesystems are stored in the *same* dataset, since there is no
// point in separating them.
export function archivesDataset({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  return `${namespaceDataset({ pool, namespace })}/archives`;
}

export function archivesMountpoint({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  return join(context.ARCHIVES, namespace, pool);
}

export function filesystemArchivePath({
  pool,
  ...fs
}: PrimaryKey & { pool: string }) {
  const pk = primaryKey(fs);
  return join(
    archivesMountpoint({ pool, namespace: pk.namespace }),
    pk.owner_type,
    pk.owner_id,
    pk.name,
  );
}

export function filesystemArchiveFilename(opts: PrimaryKey & { pool: string }) {
  const { owner_type, owner_id, name } = primaryKey(opts);
  return join(
    filesystemArchivePath(opts),
    `full-${owner_type}-${owner_id}-${name}.zfs`,
  );
}

export function filesystemStreamsPath(opts: PrimaryKey & { pool: string }) {
  return join(filesystemArchivePath(opts), "streams");
}

export function filesystemStreamsFilename({
  snapshot1,
  snapshot2,
  ...opts
}: PrimaryKey & { snapshot1: string; snapshot2: string; pool: string }) {
  return join(filesystemStreamsPath(opts), `${snapshot1}-${snapshot2}.zfs`);
}

// Bup
export function bupDataset({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  return `${namespaceDataset({ pool, namespace })}/bup`;
}

export function bupMountpoint({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  return join(context.BUP, namespace, pool);
}

export function bupFilesystemMountpoint({
  pool,
  ...fs
}: PrimaryKey & { pool: string }) {
  const pk = primaryKey(fs);
  return join(
    bupMountpoint({ ...pk, pool }),
    pk.owner_type,
    pk.owner_id,
    pk.name,
  );
}

// Filesystems

export function filesystemsPath({ namespace }) {
  return join(context.FILESYSTEMS, namespace);
}

export function filesystemMountpoint(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  return join(filesystemsPath(pk), pk.owner_type, pk.owner_id, pk.name);
}

export function filesystemSnapshotMountpoint(
  opts: PrimaryKey & { snapshot: string },
) {
  return join(filesystemMountpoint(opts), ".zfs", "snapshot", opts.snapshot);
}

export function filesystemsDataset({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  return `${namespaceDataset({ pool, namespace })}/filesystems`;
}

// There is one single dataset for each project_id/namespace/pool tripple since it
// is critical to separate each project to properly support snapshots, clones,
// backups, etc.
export function filesystemDataset({
  pool,
  ...fs
}: PrimaryKey & { pool: string }) {
  const { namespace, owner_type, owner_id, name } = primaryKey(fs);
  // NOTE: we *could* use a heirarchy of datasets like this:
  //    ${owner_type}/${owner_id}/${name}
  // However, that greatly increases the raw number of datasets, and there's a huge performance
  // penalty.  Since the owner_type is a fixed small list, owner_id is a uuid and the name is
  // more general, there's no possible overlaps just concating them as below, and this way there's
  // only one dataset, rather than three.  (We also don't need to worry about deleting parents
  // when there are no children...)
  return `${filesystemsDataset({ pool, namespace: namespace })}/${owner_type}-${owner_id}-${name}`;
}

export function tempDataset({
  pool,
  namespace,
}: {
  pool: string;
  namespace: string;
}) {
  return `${namespaceDataset({ pool, namespace })}/temp`;
}

export function filesystemDatasetTemp({
  pool,
  ...fs
}: PrimaryKey & { pool: string }) {
  const { namespace, owner_type, owner_id, name } = primaryKey(fs);
  return `${tempDataset({ pool, namespace })}/${owner_type}-${owner_id}-${name}-${randomId()}`;
}

// NOTE: We use "join" for actual file paths and explicit
// strings with / for ZFS filesystem names, since in some whacky
// futuristic world maybe this server is running on MS Windows.
