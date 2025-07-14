import {
  filesystem,
  type Filesystem,
} from "@cocalc/file-server/storage-btrfs/filesystem";
import process from "node:process";
import { chmod, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";

export let fs: Filesystem;
let tempDir;

export async function before() {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc-test-btrfs-"));
  // Set world read/write/execute
  await chmod(tempDir, 0o777);
  const mount = join(tempDir, "mnt");
  await mkdir(mount);
  await chmod(mount, 0o777);
  fs = await filesystem({
    device: join(tempDir, "btrfs.img"),
    formatIfNeeded: true,
    mount: join(tempDir, "mnt"),
    uid: process.getuid?.(),
  });
}

export async function after() {
  try {
    await fs.unmount();
  } catch {}
  await rm(tempDir, { force: true, recursive: true });
}
