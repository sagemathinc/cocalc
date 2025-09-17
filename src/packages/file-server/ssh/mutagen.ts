import { mkdtemp } from "node:fs/promises";
import { rmSync } from "node:fs";
import { execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { mutagen } from "@cocalc/backend/sandbox/install";
import { tmpdir } from "node:os";

import getLogger from "@cocalc/backend/logger";
const execFile = promisify(execFile0);

const logger = getLogger("file-server:ssh:mutagen");

let path = "";
let version = "";
export const getMutagenAgent = reuseInFlight(
  async (): Promise<{
    path: string;
    version: string;
  }> => {
    if (path && version) {
      return { path, version };
    }

    logger.debug("getMutagenAgent: extracting...");

    const tmp = await mkdtemp(join(tmpdir(), "cocalc"));
    const agentTarball = mutagen + "-agents.tar.gz";

    await execFile(
      "tar",
      [
        "xf",
        agentTarball,
        "--transform=s/linux_amd64/mutagen-agent/",
        "linux_amd64",
      ],
      { cwd: tmp },
    );

    // copy the correct agent over, extract it, and also
    // note the version.
    const { stdout } = await execFile(join(tmp, "mutagen-agent"), [
      "--version",
    ]);
    version = stdout.trim().split(" ").slice(-1)[0];
    path = tmp;
    logger.debug("getMutagenAgent: created", { version, path });

    return { path, version };
  },
);

export function close() {
  if (!path) {
    return;
  }
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {}
  path = "";
}

process.once("exit", close);
["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
  process.once(sig, () => {
    process.exit();
  });
});
