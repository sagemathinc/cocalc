import {
  filesystem,
  type Filesystem,
} from "@cocalc/file-server/btrfs/filesystem";
import { chmod, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { until } from "@cocalc/util/async-utils";
import { ensureMoreLoopbackDevices, sudo } from "../util";
export { sudo };
export { delay } from "awaiting";

export let fs: Filesystem;
let tempDir;

const TEMP_PREFIX = "cocalc-test-btrfs-";

export async function before() {
  try {
    const command = `umount ${join(tmpdir(), TEMP_PREFIX)}*/mnt`;
    // attempt to unmount any mounts left from previous runs.
    // TODO: this could impact runs in parallel
    await sudo({ command, bash: true });
  } catch {}
  await ensureMoreLoopbackDevices();
  tempDir = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  // Set world read/write/execute
  await chmod(tempDir, 0o777);
  const mount = join(tempDir, "mnt");
  await mkdir(mount);
  await chmod(mount, 0o777);
  fs = await filesystem({
    image: join(tempDir, "btrfs.img"),
    size: "1G",
    mount: join(tempDir, "mnt"),
    rustic: join(tempDir, "rustic"),
  });
  return fs;
}

export async function after() {
  await until(async () => {
    try {
      await fs.unmount();
      return true;
    } catch {
      return false;
    }
  });
  await rm(tempDir, { force: true, recursive: true });
}
