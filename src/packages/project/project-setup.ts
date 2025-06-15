/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This configures the project hub based on an environment variable or other data.
*/

import { existsSync } from "node:fs";
import { setPriority } from "node:os";

import { getLogger } from "@cocalc/project/logger";
const L = getLogger("project:project-setup");

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
    L.debug(`configure(${conf_enc.slice(0, 30)}...)`);
    const conf_raw = Buffer.from(conf_enc, "base64").toString("utf8");
    return JSON.parse(conf_raw);
  } catch (err) {
    // we report and ignore errors
    L.debug(`ERROR parsing COCALC_PROJECT_CONFIG -- '${conf_enc}' -- ${err}`);
    return null;
  }
}

// this is for kucalc projects only
export function is_free_project(): boolean {
  const conf = getProjectConfig();
  const ifp = conf?.quota?.member_host === false;
  L.debug(`is_free_project: ${ifp}`);
  return ifp;
}

export function configure() {
  if (is_free_project()) {
    L.debug(`member_host is false -- renicing everything`);
    setPriority(process.pid, DEFAULT_FREE_PROCS_NICENESS);
  }
}

/**
 * Set the given key/value pair in the environment.
 * However, for $PATH we avoid breaking the project by prepending the new value to $PATH if there is no "$PATH" in the value,
 * or we insert the existing value of $PATH where the string "$PATH" is found in the value as a placeholder.
 *
 * Ref: https://github.com/sagemathinc/cocalc/issues/7404
 */
function set_sanitized_envvar(key: string, value: string): string {
  if (key === "PATH") {
    if (value.indexOf("$PATH") !== -1) {
      value = value.replace(/\$PATH/g, process.env.PATH || "");
    } else {
      value = `${value}:${process.env.PATH}`;
    }
  }
  process.env[key] = value;
  return value;
}

// Contains additional environment variables. Base 64 encoded JSON of {[key:string]:string}.
export function set_extra_env(): { [key: string]: string } | undefined {
  sage_aarch64_hack();

  if (!process.env.COCALC_EXTRA_ENV) {
    L.debug("set_extra_env: nothing provided");
    return;
  }

  const ret: { [key: string]: string } = {};
  try {
    const env64 = process.env.COCALC_EXTRA_ENV;
    const raw = Buffer.from(env64, "base64").toString("utf8");
    L.debug(`set_extra_env: ${raw}`);
    const data = JSON.parse(raw);
    if (typeof data === "object") {
      for (let k in data) {
        const v = data[k];
        if (typeof v !== "string" || v.length === 0) {
          L.debug(
            `set_extra_env: ignoring key ${k}, value is not a string or has length 0`,
          );
          continue;
        }
        // this is the meat of all this – this should happen after cleanup()!
        ret[k] = set_sanitized_envvar(k, v);
      }
    }
  } catch (err) {
    // we report and ignore errors
    L.debug(
      `ERROR set_extra_env -- cannot process '${process.env.COCALC_EXTRA_ENV}' -- ${err}`,
    );
  }
  return ret;
}

// this should happen before set_extra_env
export function cleanup(): void {
  // clean/sanitize environment to get rid of nvm and other variables
  if (process.env.PATH == null) return;
  process.env.PATH = process.env.PATH.split(":")
    .filter((x) => !x.startsWith("/cocalc/nvm"))
    .join(":");
  // don't delete NODE_ENV below, since it's potentially confusing to have the value of NODE_ENV change
  // during a running program.
  // Also, don't delete DEBUG, since doing that in some cases breaks the debug library actually working,
  // not surprisingly.  Some additional cleanup is done wherever we spawn subprocesses,
  // and then NODE_ENV and DEBUG are added back to being removed. See envForSpawn in
  // @cocalc/backend/misc.
  const envrm = [
    "DATA",
    "BASE_PATH",
    "NODE_PATH",
    "NODE_VERSION",
    "NVM_CD_FLAGS",
    "NVM_DIR",
    "NVM_BIN",
    "PATH_COCALC",
    "COCALC_ROOT",
    "DEBUG_CONSOLE",
    "CONAT_SERVER",
    "PORT",
    "HISTFILE",
    "PROMPT_COMMAND",
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
