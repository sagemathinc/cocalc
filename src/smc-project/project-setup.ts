/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This configures the project hub based on an environment variable or other data.
*/

import * as debug from "debug";
const L = debug("project:project-setup");
import { setPriority } from "os";
// const { callback2: cb2 } = require("smc-util/async-utils");
// const { execute_code } = require("smc-util-node/misc_node");

// 19 is the minimum, we keep it 1 above that.
export const DEFAULT_FREE_PROCS_NICENESS = 18;

// this is for kucalc projects only
export function is_free_project(): boolean {
  const conf_enc = process.env.COCALC_PROJECT_CONFIG;
  if (conf_enc == null) {
    L("No COCALC_PROJECT_CONFIG env variable");
    return false;
  }
  try {
    L(`configure(${conf_enc.slice(0, 30)}...)`);
    const conf_raw = Buffer.from(conf_enc, "base64").toString("utf8");
    const conf = JSON.parse(conf_raw);
    const ifp = conf?.quota?.member_host === false;
    L(`is_free_project: ${ifp}`);
    return ifp;
  } catch (err) {
    // we report and ignore errors
    L(`ERROR configure -- cannot process '${conf_enc}' -- ${err}`);
    return false;
  }
}

export function configure() {
  if (is_free_project()) {
    L(`member_host is false -- renicing everything`);
    setPriority(process.pid, DEFAULT_FREE_PROCS_NICENESS);
  }
}

// Contains additional environment variables. Base 64 encoded JSON of {[key:string]:string}.
export function set_extra_env(): void {
  if (!process.env.COCALC_EXTRA_ENV) {
    L("set_extra_env: nothing provided");
    return;
  }
  try {
    const env64 = process.env.COCALC_EXTRA_ENV;
    const raw = Buffer.from(env64, "base64").toString("utf8");
    L(`set_extra_env: ${raw}`);
    const data = JSON.parse(raw);
    if (typeof data === "object") {
      for (let k in data) {
        const v = data[k];
        if (typeof v !== "string" || v.length === 0) {
          L(
            `set_extra_env: ignoring key ${k}, value is not a string or has length 0`
          );
          continue;
        }
        // this is the meat of all this – this should happen after cleanup()!
        process.env[k] = v;
      }
    }
  } catch (err) {
    // we report and ignore errors
    return L(
      `ERROR set_extra_env -- cannot process '${process.env.COCALC_EXTRA_ENV}' -- ${err}`
    );
  }
}

// this should happen before set_extra_env
export function cleanup(): void {
  // clean environment to get rid of nvm and other variables
  if (process.env.PATH == null) return;
  process.env.PATH = process.env.PATH.split(":")
    .filter((x) => !x.startsWith("/cocalc/nvm"))
    .join(":");
  const envrm = [
    "NODE_PATH",
    "NODE_ENV",
    "NODE_VERSION",
    "NVM_CD_FLAGS",
    "NVM_DIR",
    "NVM_BIN",
    "DEBUG",
  ];
  envrm.forEach((name) => delete process.env[name]);
}
