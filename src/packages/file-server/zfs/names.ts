import { join } from "path";
import { context } from "./config";
import { primaryKey, type PrimaryKey } from "./types";
import { randomId } from "@cocalc/nats/names";

export function databaseFilename(data: string) {
  return join(data, "database.sqlite3");
}

export function namespaceDataset({ namespace }: { namespace: string }) {
  return `${namespace}`;
}

// Archives
export function archivesDataset({ namespace }: { namespace: string }) {
  return `${namespaceDataset({ namespace })}/archives`;
}

export function archivesMountpoint({ namespace }: { namespace: string }) {
  return join(context.ARCHIVES, namespace);
}

export function imagesMountpoint({ namespace }: { namespace: string }) {
  return join(context.IMAGES, namespace);
}

export function filesystemArchivePath(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  return join(
    archivesMountpoint({ namespace: pk.namespace }),
    pk.owner_type,
    pk.owner_id,
    pk.name,
  );
}

export function filesystemArchiveFilename(opts: PrimaryKey) {
  const { owner_type, owner_id, name } = primaryKey(opts);
  return join(
    filesystemArchivePath(opts),
    `full-${owner_type}-${owner_id}-${name}.zfs`,
  );
}

export function filesystemStreamsPath(opts: PrimaryKey) {
  return join(filesystemArchivePath(opts), "streams");
}

export function filesystemImagePath(opts: PrimaryKey) {
  const pk = primaryKey(opts);
  return join(
    imagesMountpoint({ namespace: pk.namespace }),
    pk.owner_type,
    pk.owner_id,
    pk.name,
  );
}

export function filesystemStreamsFilename({
  snapshot1,
  snapshot2,
  ...opts
}: PrimaryKey & { snapshot1: string; snapshot2: string }) {
  return join(filesystemStreamsPath(opts), `${snapshot1}-${snapshot2}.zfs`);
}

// Bup
export function bupDataset({ namespace }: { namespace: string }) {
  return `${namespaceDataset({ namespace })}/bup`;
}

export function bupMountpoint({ namespace }: { namespace: string }) {
  return join(context.BUP, namespace);
}

export function bupFilesystemMountpoint(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  return join(bupMountpoint(pk), pk.owner_type, pk.owner_id, pk.name);
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

export function filesystemsDataset({ namespace }: { namespace: string }) {
  return `${namespaceDataset({ namespace })}/filesystems`;
}

export function filesystemPool(fs: PrimaryKey) {
  const { namespace, owner_type, owner_id, name } = primaryKey(fs);
  return `${namespace}-${owner_type}-${owner_id}-${name}`;
}

// There is one single dataset for each project_id/namespace/pool tripple since it
// is critical to separate each project to properly support snapshots, clones,
// backups, etc.
export function filesystemDataset(fs: PrimaryKey) {
  return join(filesystemPool(fs), "main");
}

export function tempDataset({ namespace }: { namespace: string }) {
  return `${namespaceDataset({ namespace })}/temp`;
}

export function filesystemDatasetTemp(fs: PrimaryKey) {
  const { namespace, owner_type, owner_id, name } = primaryKey(fs);
  return join(filesystemPool(fs), "temp");
}

// NOTE: We use "join" for actual file paths and explicit
// strings with / for ZFS filesystem names, since in some whacky
// futuristic world maybe this server is running on MS Windows.
