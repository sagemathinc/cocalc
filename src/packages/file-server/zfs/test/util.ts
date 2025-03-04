// application/typescript text
import {
  POOL_PREFIX,
  SQLITE3_DATABASE_FILE,
} from "@cocalc/file-server/zfs/config";
import { mkdtemp, rm, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { executeCode } from "@cocalc/backend/execute-code";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { initDataDir } from "@cocalc/file-server/zfs/util";

export async function initDb() {
  if (!POOL_PREFIX.includes("test")) {
    throw Error("POOL_PREFIX must contain 'test'");
  }
  await initDataDir();
  if (await exists(SQLITE3_DATABASE_FILE)) {
    await unlink(SQLITE3_DATABASE_FILE);
  }
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
