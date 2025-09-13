import getLogger from "@cocalc/backend/logger";
import { basename, dirname, join } from "node:path";
import { root } from "@cocalc/backend/data";
import { exists } from "@cocalc/backend/misc/async-utils-node";

const logger = getLogger("project-runner:mounts");

const MOUNTS = {
  "-R": ["/etc", "/var", "/bin", "/lib", "/usr", "/lib64", "/run"],
  "-B": ["/dev"],
};

// default - it gets changed to something *inside* the container when getCocalcMounts() is called
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

export const COCALC_BIN = "/opt/cocalc/bin";
export const COCALC_SRC = "/opt/cocalc/src";
export function getCoCalcMounts() {
  // NODEJS_SEA_PATH is where we mount the directory containing the nodejs SEA binary,
  // which we *also* use for running the project itself.
  nodePath = join(COCALC_BIN, basename(process.execPath));
  // IMPORTANT: take care not to put the binary next to sensitive info due
  // to mapping in process.execPath!
  return {
    // /cocalc is where the project Javascript code is located
    [join(dirname(root), "src")]: COCALC_SRC,
    [dirname(process.execPath)]: COCALC_BIN,
  };
}

export async function getMounts() {
  await init();
  return MOUNTS;
}
