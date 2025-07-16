import {
  filesystem,
  type Filesystem,
} from "@cocalc/file-server/btrfs/filesystem";
import { chmod, mkdtemp, mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { until } from "@cocalc/util/async-utils";
import { sudo } from "../util";
export { sudo };
export { delay } from "awaiting";

export let fs: Filesystem;
let tempDir;

const TEMP_PREFIX = "cocalc-test-btrfs-";

async function ensureMoreLoops() {
  // to run tests, this is helpful
  //for i in $(seq 8 63); do sudo mknod -m660 /dev/loop$i b 7 $i; sudo chown root:disk /dev/loop$i; done
  for (let i = 0; i < 64; i++) {
    try {
      await stat(`/dev/loop${i}`);
      continue;
    } catch {}
    try {
      // also try/catch this because ensureMoreLoops happens in parallel many times at once...
      await sudo({
        command: "mknod",
        args: ["-m660", `/dev/loop${i}`, "b", "7", `${i}`],
      });
    } catch {}
    await sudo({ command: "chown", args: ["root:disk", `/dev/loop${i}`] });
  }
}

export async function before() {
  try {
    const command = `umount ${join(tmpdir(), TEMP_PREFIX)}*/mnt`;
    // attempt to unmount any mounts left from previous runs.
    // TODO: this could impact runs in parallel
    await sudo({ command, bash: true });
  } catch {}
  await ensureMoreLoops();
  tempDir = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
  // Set world read/write/execute
  await chmod(tempDir, 0o777);
  const mount = join(tempDir, "mnt");
  await mkdir(mount);
  await chmod(mount, 0o777);
  fs = await filesystem({
    device: join(tempDir, "btrfs.img"),
    formatIfNeeded: true,
    mount: join(tempDir, "mnt"),
  });
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
