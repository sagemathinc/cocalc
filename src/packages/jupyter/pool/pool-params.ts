/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Parameters for the Jupyter Pool
// They're loaded right after custom env variables are set, such that not only admins of the platform,
// but also users on their own can tune them.

import { join } from "node:path";
import { homedir } from "node:os";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("jupyter:pool-params");

// read env vars with that prefix
const PREFIX = "COCALC_JUPYTER_POOL";
// avoid craziness:
const MAX_POOL_SIZE = 10;

// the defaults
const CONFIG_FILENAME = `cocalc-jupyter-pool${
  process.env.COMPUTE_SERVER_ID ?? ""
}`;
const CONFIG_DIR = join(homedir(), ".config");
const CONFIG = join(CONFIG_DIR, CONFIG_FILENAME);
// size of pool, set to 0 to disable it.
function getPoolSize(): number {
  try {
    const size = parseInt(process.env.COCALC_JUPYTER_POOL_SIZE ?? "1");
    if (!isFinite(size)) {
      logger.debug(
        "getPoolSize ",
        process.env.COCALC_JUPYTER_POOL_SIZE,
        " not finite",
      );
      // disable
      return 0;
    }
    if (size < 0) {
      logger.debug(
        "getPoolSize ",
        process.env.COCALC_JUPYTER_POOL_SIZE,
        " negative -- setting to 0",
      );
      return 0;
    }
    if (size > MAX_POOL_SIZE) {
      return MAX_POOL_SIZE;
    }
    return size;
  } catch (err) {
    logger.debug("getPoolSize -- error -- disabling pool", err);
    return 0;
  }
  return 0;
}
const SIZE = getPoolSize();
const TIMEOUT_S = 3600; // after that time, clean up old kernels in the pool
const LAUNCH_DELAY_MS = 7500; // additional delay before spawning an additional kernel

const PARAMS = {
  SIZE,
  TIMEOUT_S,
  LAUNCH_DELAY_MS,
  CONFIG_FILENAME,
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
        logger.debug(`setting ${key} to ${num} (converted from '${val}')`);
        PARAMS[key] = num;
      } else {
        logger.debug(`setting ${key} to '${val}'`);
        PARAMS[key] = val;
      }
    }
  }
  PARAMS.CONFIG = join(PARAMS.CONFIG_DIR, PARAMS.CONFIG_FILENAME);
  logger.debug("jupyter kernel pool parameters: ", PARAMS);
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
