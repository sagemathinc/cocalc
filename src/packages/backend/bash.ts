/*
Easily spawn a bash script given by a string, which is written to a temp file
that is automatically removed on exit.    Returns a child process.
*/

import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  ChildProcessWithoutNullStreams,
  spawn,
  SpawnOptionsWithoutStdio,
} from "node:child_process";
import { cleanUpTempDir } from "./execute-code";
import { join } from "node:path";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("bash");

export default async function bash(
  command: string,
  spawnOptions?: SpawnOptionsWithoutStdio,
): Promise<ChildProcessWithoutNullStreams> {
  let tempDir = "";
  let tempPath = "";
  try {
    tempDir = await mkdtemp(join(tmpdir(), "cocalc-"));
    tempPath = join(tempDir, "a.sh");
    logger.debug("bash:writing temp file that contains bash program", command);
    await writeFile(tempPath, command);
    await chmod(tempPath, 0o700);
  } catch (err) {
    await cleanUpTempDir(tempDir);
    throw err;
  }
  logger.debug("spawning bash program");
  const child = spawn("bash", [tempPath], spawnOptions);
  child.once("exit", async () => {
    await cleanUpTempDir(tempDir);
  });
  return child;
}
