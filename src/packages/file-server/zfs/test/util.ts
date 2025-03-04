// application/typescript text
import { POOL_PREFIX } from "@cocalc/file-server/zfs/config";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { executeCode } from "@cocalc/backend/execute-code";
import { initDataDir } from "@cocalc/file-server/zfs/util";
import { resetDb } from "@cocalc/file-server/zfs/db";
import { getPools } from "@cocalc/file-server/zfs/pools";
import { execSync } from "child_process";
import { map as asyncMap } from "awaiting";

// export "describe" from here that is a no-op if the zpool
// command is not available:
function isZpoolAvailable() {
  try {
    execSync("which zpool", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const Describe = isZpoolAvailable() ? describe : describe.skip;
export { Describe as describe };

export async function init() {
  if (!POOL_PREFIX.includes("test")) {
    throw Error("POOL_PREFIX must contain 'test'");
  }
  await initDataDir();
  resetDb();
}

export async function createTestPools({
  size = "10G",
  count = 1,
}: {
  size?: string;
  count?: number;
}): Promise<{ tempDir: string; pools: string[] }> {
  if (!POOL_PREFIX.includes("test")) {
    throw Error("POOL_PREFIX must contain 'test'");
  }
  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), "test-"));
  const pools: string[] = [];
  // in case pools left from a failing test:
  for (const pool of Object.keys(await getPools())) {
    try {
      await executeCode({
        command: "sudo",
        args: ["zpool", "destroy", pool],
      });
    } catch {}
  }
  for (let n = 0; n < count; n++) {
    const image = join(tempDir, `${n}`, "0.img");
    await executeCode({
      command: "mkdir",
      args: [join(tempDir, `${n}`)],
    });
    await executeCode({
      command: "truncate",
      args: ["-s", size, image],
    });
    const pool = `${POOL_PREFIX}-${n}`;
    pools.push(pool);
    await executeCode({
      command: "sudo",
      args: ["zpool", "create", pool, image],
    });
  }
  // ensure pool cache is cleared:
  await getPools({ noCache: true });
  return { tempDir, pools };
}

// Even after setting sharefnfs=off, it can be a while (a minute?) until NFS
// fully frees up the share so we can destroy the pool.  This makes it instant,
// which is very useful for unit testing.
export async function restartNfsServer() {
  await executeCode({
    command: "sudo",
    args: ["service", "nfs-kernel-server", "restart"],
  });
}

export async function deleteTestPools({ tempDir, pools }) {
  if (!POOL_PREFIX.includes("test")) {
    throw Error("POOL_PREFIX must contain 'test'");
  }

  const f = async (pool) => {
    await executeCode({
      command: "sudo",
      args: ["zpool", "destroy", pool],
    });
  };
  await asyncMap(pools, pools.length, f);
  await rm(tempDir, { recursive: true });
}
