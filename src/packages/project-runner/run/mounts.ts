import { dirname, join } from "node:path";
import { root } from "@cocalc/backend/data";

// default - it gets changed to something *inside* the container when getCocalcMounts() is called
export let nodePath = process.execPath;

export const COCALC_BIN = "/opt/cocalc/bin";
export const COCALC_SRC = "/opt/cocalc/src";
export function getCoCalcMounts() {
  // NODEJS_SEA_PATH is where we mount the directory containing the nodejs SEA binary,
  // which we *also* use for running the project itself.
  // Also, we assume that there is "node" here, e.g., this could be a symlink to
  // the cocalc-project-runner binary, or it could just be the normal node binary.
  nodePath = join(COCALC_BIN, "node");
  // IMPORTANT: take care not to put the binary next to sensitive info due
  // to mapping in process.execPath!
  return {
    // /cocalc is where the project Javascript code is located
    [join(dirname(root), "src")]: COCALC_SRC,
    [dirname(process.execPath)]: COCALC_BIN,
  };
}
