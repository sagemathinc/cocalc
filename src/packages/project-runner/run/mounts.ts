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
  const cocalcMounts = getCoCalcMounts();
  for (const path in cocalcMounts) {
    MOUNTS[path] = cocalcMounts[path];
  }
  logger.debug(MOUNTS);
}

export function getCoCalcMounts() {
  nodePath = join("/cocalc/bin", basename(process.execPath));
  // IMPORTANT: take care not to put the binary next to sensitive info due
  // to mapping in process.execPath!
  return {
    [dirname(root)]: "/cocalc",
    [dirname(process.execPath)]: "/cocalc/bin",
  };
}

export async function getMounts() {
  await init();
  return MOUNTS;
}
