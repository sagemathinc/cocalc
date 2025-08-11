/*


DEVELOPMENT:

~/cocalc/src/packages/server/conat/file-server$ node
Welcome to Node.js v20.19.1.
Type ".help" for more information.
> require('@cocalc/backend/conat'); c = require('@cocalc/conat/files/file-server').client()

*/

import { conat } from "@cocalc/backend/conat";
import {
  server as createFileServer,
  client as createFileClient,
  type Fileserver,
  type CopyOptions,
} from "@cocalc/conat/files/file-server";
export type { Fileserver };
import { loadConatConfiguration } from "../configuration";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { data } from "@cocalc/backend/data";
import { join } from "node:path";
import { mkdir } from "fs/promises";
import { filesystem, type Filesystem } from "@cocalc/file-server/btrfs";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import * as rustic from "./rustic";

const logger = getLogger("server:conat:file-server");

function name(project_id: string) {
  return `project-${project_id}`;
}

export async function getVolume(project_id) {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  return await fs.subvolumes.get(name(project_id));
}

async function mount({
  project_id,
}: {
  project_id: string;
}): Promise<{ path: string }> {
  logger.debug("mount", { project_id });
  const { path } = await getVolume(project_id);
  return { path };
}

async function clone({
  project_id,
  src_project_id,
}: {
  project_id: string;
  src_project_id: string;
}): Promise<void> {
  logger.debug("clone", { project_id });

  if (fs == null) {
    throw Error("file server not initialized");
  }
  await fs.subvolumes.clone(name(src_project_id), name(project_id));
}

async function getUsage({ project_id }: { project_id: string }): Promise<{
  size: number;
  used: number;
  free: number;
}> {
  logger.debug("getUsage", { project_id });
  const vol = await getVolume(project_id);
  return await vol.quota.usage();
}

async function getQuota({ project_id }: { project_id: string }): Promise<{
  size: number;
  used: number;
}> {
  logger.debug("getQuota", { project_id });
  const vol = await getVolume(project_id);
  return await vol.quota.get();
}

async function setQuota({
  project_id,
  size,
}: {
  project_id: string;
  size: number | string;
}): Promise<void> {
  logger.debug("setQuota", { project_id });
  const vol = await getVolume(project_id);
  await vol.quota.set(size);
}

async function cp({
  src,
  dest,
  options,
}: {
  // the src paths are relative to the src volume
  src: { project_id: string; path: string | string[] };
  // the dest path is relative to the dest volume
  dest: { project_id: string; path: string };
  // because our fs is btrfs, we default the options to reflink=true,
  // which uses almost no disk and is super fast
  options?: CopyOptions;
}): Promise<void> {
  if (fs == null) {
    throw Error("file server not initialized");
  }
  const srcVolume = await getVolume(src.project_id);
  const destVolume = await getVolume(dest.project_id);
  let srcPaths = await srcVolume.fs.safeAbsPaths(src.path);
  let destPath = await destVolume.fs.safeAbsPath(dest.path);

  const toRelative = (path) => {
    if (!path.startsWith(fs!.subvolumes.fs.path)) {
      throw Error("bug");
    }
    return path.slice(fs!.subvolumes.fs.path.length + 1);
  };
  srcPaths = srcPaths.map(toRelative);
  destPath = toRelative(destPath);
  // NOTE: we *always* make reflink true because the filesystem is btrfs!
  await fs.subvolumes.fs.cp(
    typeof src.path == "string" ? srcPaths[0] : srcPaths, // careful to preserve string versus string[]
    destPath,
    { ...options, reflink: true },
  );
}

let fs: Filesystem | null = null;
let server: any = null;
export async function init() {
  if (server != null) {
    return;
  }
  await loadConatConfiguration();
  const image = join(data, "btrfs", "image");
  if (!(await exists(image))) {
    await mkdir(image, { recursive: true });
  }
  const btrfsDevice = join(image, "btrfs.img");
  const mountPoint = join(data, "btrfs", "mnt");
  if (!(await exists(mountPoint))) {
    await mkdir(mountPoint, { recursive: true });
  }

  fs = await filesystem({
    device: btrfsDevice,
    size: "25G",
    mount: mountPoint,
  });

  server = await createFileServer({
    client: conat(),
    mount: reuseInFlight(mount),
    clone,
    getUsage: reuseInFlight(getUsage),
    getQuota: reuseInFlight(getQuota),
    setQuota,
    cp,
    backup: reuseInFlight(rustic.backup),
    restore: rustic.restore,
    deleteBackup: rustic.deleteBackup,
    getBackups: reuseInFlight(rustic.getBackups),
    getBackupFiles: reuseInFlight(rustic.getBackupFiles),
  });
}

export function close() {
  server?.close();
  server = null;
}

let cachedClient: null | Fileserver = null;
export function client(): Fileserver {
  cachedClient ??= createFileClient({ client: conat() });
  return cachedClient!;
}
