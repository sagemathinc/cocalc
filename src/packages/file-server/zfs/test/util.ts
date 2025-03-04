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
export {};

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

export async function deleteTestPools({ tempDir, pools }) {
  if (!POOL_PREFIX.includes("test")) {
    throw Error("POOL_PREFIX must contain 'test'");
  }
  for (const pool of pools) {
    await executeCode({
      command: "sudo",
      args: ["zpool", "destroy", pool],
    });
  }
  await rm(tempDir, { recursive: true });
}
