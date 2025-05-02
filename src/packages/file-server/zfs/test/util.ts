// application/typescript text
import { context, setContext } from "@cocalc/file-server/zfs/config";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { executeCode } from "@cocalc/backend/execute-code";
import { initDataDir } from "@cocalc/file-server/zfs/util";
import { resetDb } from "@cocalc/file-server/zfs/db";

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
  data,
}: {
  size?: string;
  count?: number;
  data?: string;
}): Promise<{ tempDir: string; data?: string }> {
  console.log("TODO:", { size, count });
  setContext({ data });
  if (!context.DATA.includes("test")) {
    throw Error(`context.DATA=${context.DATA} must contain 'test'`);
  }
  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), "test-"));
  return { tempDir, data };
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

export async function deleteTestPools(x?: { tempDir: string; data?: string }) {
  if (!x) {
    return;
  }
  const { data } = x;
  setContext({ data });
  if (!context.DATA.includes("test")) {
    throw Error("context.DATA must contain 'test'");
  }
  throw Error("not implemented");
}
