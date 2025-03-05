import { join } from "path";
import { FILESYSTEMS, ARCHIVES, BUP } from "./config";
import { primaryKey, type PrimaryKey } from "./types";

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
  return join(ARCHIVES, namespace, pool);
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
  );
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
  return join(BUP, namespace, pool);
}

export function bupFilesystemMountpoint({
  pool,
  ...fs
}: PrimaryKey & { pool: string }) {
  const pk = primaryKey(fs);
  return join(bupMountpoint({ ...pk, pool }), pk.owner_type, pk.owner_id);
}

// Filesystems

export function filesystemsPath({ namespace }) {
  return join(FILESYSTEMS, namespace);
}

export function filesystemMountpoint(fs: PrimaryKey) {
  const pk = primaryKey(fs);
  return join(filesystemsPath(pk), pk.owner_type, pk.owner_id);
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
  const pk = primaryKey(fs);
  return `${filesystemsDataset({ pool, namespace: pk.namespace })}/${pk.owner_type}/${pk.owner_id}`;
}

// NOTE: We use "join" for actual file paths and explicit
// strings with / for ZFS filesystem names, since in some whacky
// futuristic world maybe this server is running on MS Windows.
