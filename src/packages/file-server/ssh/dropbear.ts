import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { dropbear } from "@cocalc/backend/sandbox/install";
import { tmpdir } from "node:os";

import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:ssh:dropbear");

let path = "";
export const getDropbearServer = reuseInFlight(
  async ({ publicKey }: { publicKey: string }): Promise<string> => {
    if (path) {
      return path;
    }

    logger.debug("getDropbearServer: copying...");

    const tmp = await mkdtemp(join(tmpdir(), "cocalc"));
    await cp(dropbear, join(tmp, "dropbear"));
    await writeFile(join(tmp, "authorized_keys"), publicKey);
    path = tmp;

    logger.debug("getDropbearServer: created", path);

    return path;
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
