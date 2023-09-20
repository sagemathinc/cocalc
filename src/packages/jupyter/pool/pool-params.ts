/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Parameters for the Jupyter Pool
// They're loaded right after custom env variables are set, such that not only admins of the platform,
// but also users on their own can tune them.

import { join } from "node:path";
import { homedir } from "node:os";
import getLogger from "@cocalc/backend/logger";

const L = getLogger("jupyter:pool-params").debug;

// read env vars with that prefix
const PREFIX = "COCALC_JUPYTER_POOL";

// the defaults
const CONFIG_FN = "cocalc-jupyter-pool";
const CONFIG_DIR = join(homedir(), ".config");
const CONFIG = join(CONFIG_DIR, CONFIG_FN);
const SIZE = 1; // size of pool, set to 0 to disable it
const TIMEOUT_S = 3600; // after that time, clean up old kernels in the pool
const LAUNCH_DELAY_MS = 7500; // additional delay before spawning an additional kernel

const PARAMS = {
  SIZE,
  TIMEOUT_S,
  LAUNCH_DELAY_MS,
  CONFIG_FN,
  CONFIG_DIR,
  CONFIG,
};

export function init() {
  // at this point, project-setup::set_extra_env has already been called.
  // hence process.env contains global env vars set in init.sh and user specified env vars
  const env = process.env;
  for (const key in PARAMS) {
    // we derive the full path, see end of this function
    if (key === "CONFIG") continue;
    const varName = `${PREFIX}_${key}`;
    if (varName in env) {
      const val = env[varName];
      if (val === "") continue; // ignore empty values
      // if val can be converted to a number, use the integer value
      const num = Number(val);
      if (!Number.isNaN(num)) {
        L(`setting ${key} to ${num} (converted from '${val}')`);
        PARAMS[key] = num;
      } else {
        L(`setting ${key} to '${val}'`);
        PARAMS[key] = val;
      }
    }
  }
  PARAMS.CONFIG = join(PARAMS.CONFIG_DIR, PARAMS.CONFIG_FN);
}

export function getSize(): number {
  return PARAMS.SIZE;
}

export function getTimeoutS(): number {
  return PARAMS.TIMEOUT_S;
}

export function getLaunchDelayMS(): number {
  return PARAMS.LAUNCH_DELAY_MS;
}

export function getConfig(): string {
  return PARAMS.CONFIG;
}

export function getConfigDir(): string {
  return PARAMS.CONFIG_DIR;
}
