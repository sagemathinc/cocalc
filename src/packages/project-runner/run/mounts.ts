import getLogger from "@cocalc/backend/logger";
import { basename, dirname, join } from "node:path";
import { root } from "@cocalc/backend/data";
import { exists } from "@cocalc/backend/misc/async-utils-node";

const logger = getLogger("project-runner:mounts");

const MOUNTS = {
  "-R": ["/etc", "/var", "/bin", "/lib", "/usr", "/lib64", "/run"],
  "-B": ["/dev"],
};

export let nodePath = process.execPath;
let initialized = false;
export async function init() {
  if (initialized) {
    return;
  }
  logger.debug("init");
  initialized = true;
  for (const type in MOUNTS) {
    const v: string[] = [];
    for (const path of MOUNTS[type]) {
      if (await exists(path)) {
        v.push(path);
      }
    }
    MOUNTS[type] = v;
  }
  MOUNTS["-R"].push(`${dirname(root)}:/cocalc`);

  // also if this node is install via nvm, we make exactly this
  // version of node's install available
  if (!process.execPath.startsWith("/usr/")) {
    // not already in an obvious system-wide place we included above
    // IMPORTANT: take care not to put the binary next to sensitive info!
    MOUNTS["-R"].push(`${dirname(process.execPath)}:/cocalc/bin`);
    nodePath = join("/cocalc/bin", basename(process.execPath));
  }
  logger.debug(MOUNTS);
}

export async function getMounts() {
  await init();
  return MOUNTS;
}
