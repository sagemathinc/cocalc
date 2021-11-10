/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This configures the project hub based on an environment variable or other data.
*/

import debug from "debug";
const L = debug("project:project-setup");
import { setPriority } from "os";
import { existsSync } from "fs";
// const { callback2: cb2 } = require("@cocalc/util/async-utils");
// const { execute_code } = require("@cocalc/backend/misc_node");

// 19 is the minimum, we keep it 1 above that.
export const DEFAULT_FREE_PROCS_NICENESS = 18;

// this only lists some of the fields in use, there might be more
interface ProjectConfig {
  quota?: {
    member_host?: boolean;
    dedicated_disks?: { name: string }[];
  };
}

export function getProjectConfig(): ProjectConfig | null {
  const conf_enc = process.env.COCALC_PROJECT_CONFIG;
  if (conf_enc == null) {
    return null;
  }
  try {
    L(`configure(${conf_enc.slice(0, 30)}...)`);
    const conf_raw = Buffer.from(conf_enc, "base64").toString("utf8");
    return JSON.parse(conf_raw);
  } catch (err) {
    // we report and ignore errors
    L(`ERROR parsing COCALC_PROJECT_CONFIG -- '${conf_enc}' -- ${err}`);
    return null;
  }
}

// this is for kucalc projects only
export function is_free_project(): boolean {
  const conf = getProjectConfig();
  const ifp = conf?.quota?.member_host === false;
  L(`is_free_project: ${ifp}`);
  return ifp;
}

export function configure() {
  if (is_free_project()) {
    L(`member_host is false -- renicing everything`);
    setPriority(process.pid, DEFAULT_FREE_PROCS_NICENESS);
  }
}

// Contains additional environment variables. Base 64 encoded JSON of {[key:string]:string}.
export function set_extra_env(): void {
  sage_aarch64_hack();

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
    "DATA",
    "BASE_PATH",
    "NODE_PATH",
    "NODE_ENV",
    "NODE_VERSION",
    "NVM_CD_FLAGS",
    "NVM_DIR",
    "NVM_BIN",
    "DEBUG",
    "PATH_COCALC",
    "COCALC_ROOT",
  ];
  envrm.forEach((name) => delete process.env[name]);

  // Also get rid of any npm_ vars that get set due to how the project server
  // is started. This is mainly an issue with cocalc-docker.
  for (const key in process.env) {
    if (key.startsWith("npm_")) delete process.env[key];
  }
}

// See https://github.com/opencv/opencv/issues/14884
// Importing Sage in various situations, e.g., as is done for sage server,
// is fundamentally broken on aarch64 linux due to this issue. Yes, I explained
// this on sage-devel, but nobody understood.
// It's also important to NOT do this hack if you're not on aarch64!
function sage_aarch64_hack(): void {
  const LD_PRELOAD = "/usr/lib/aarch64-linux-gnu/libgomp.so.1";
  if (process.arch == "arm64" && existsSync(LD_PRELOAD)) {
    process.env.LD_PRELOAD = LD_PRELOAD;
  }
}
