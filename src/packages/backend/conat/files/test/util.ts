import { localPathFileserver } from "../local-path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { client } from "@cocalc/backend/conat/test/setup";
import { randomId } from "@cocalc/conat/names";

const tempDirs: string[] = [];
const servers: any[] = [];
export async function createPathFileserver({
  service = `fs-${randomId()}`,
}: { service?: string } = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), `cocalc-${randomId()}0`));
  tempDirs.push(tempDir);
  const server = await localPathFileserver({ client, service, path: tempDir });
  servers.push(server);
  return server;
}

// clean up any
export async function cleanupFileservers() {
  for (const server of servers) {
    server.close();
  }
  for (const tempDir of tempDirs) {
    try {
      await rm(tempDir, { force: true, recursive: true });
    } catch {}
  }
}
