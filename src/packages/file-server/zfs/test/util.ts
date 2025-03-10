// application/typescript text
import { context, setContext } from "@cocalc/file-server/zfs/config";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { executeCode } from "@cocalc/backend/execute-code";
import { initDataDir } from "@cocalc/file-server/zfs/util";
import { resetDb } from "@cocalc/file-server/zfs/db";
import { getPools } from "@cocalc/file-server/zfs/pools";
import { map as asyncMap } from "awaiting";

// export "describe" from here that is a no-op unless TEST_ZFS is set

const Describe = process.env.TEST_ZFS ? describe : describe.skip;
const describe0 = describe;
export { Describe as describe, describe0 };

export async function init() {
  if (!context.PREFIX.includes("test")) {
    throw Error("context.PREFIX must contain 'test'");
  }
  await initDataDir();
  resetDb();
}

export async function createTestPools({
  size = "10G",
  count = 1,
  prefix,
}: {
  size?: string;
  count?: number;
  prefix?: string;
}): Promise<{ tempDir: string; pools: string[]; prefix?: string }> {
  setContext({ prefix });
  if (!context.PREFIX.includes("test")) {
    throw Error(`context.PREFIX=${context.PREFIX} must contain 'test'`);
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
    const pool = `${context.PREFIX}-${n}`;
    pools.push(pool);
    await executeCode({
      command: "sudo",
      args: ["zpool", "create", pool, image],
    });
  }
  // ensure pool cache is cleared:
  await getPools({ noCache: true });
  return { tempDir, pools, prefix };
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

export async function deleteTestPools(x?: {
  tempDir: string;
  pools: string[];
  prefix?: string;
}) {
  if (!x) {
    return;
  }
  const { tempDir, pools, prefix } = x;
  setContext({ prefix });
  if (!context.PREFIX.includes("test")) {
    throw Error("context.PREFIX must contain 'test'");
  }

  const f = async (pool) => {
    try {
      await executeCode({
        command: "sudo",
        args: ["zpool", "destroy", pool],
      });
    } catch (err) {
      //       if (!`$err}`.includes("no such pool")) {
      //         console.log(err);
      //       }
    }
  };
  await asyncMap(pools, pools.length, f);
  await rm(tempDir, { recursive: true });
}
