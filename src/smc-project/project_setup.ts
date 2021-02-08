/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This configures the project hub based on an environment variable or other data.
*/

import * as debug from "debug";
const L = debug("project:autorenice");
import { setPriority } from "os";

export function configure(conf_enc) {
  L(`configure(${conf_enc.slice(0, 30)})...`);
  try {
    const conf_raw = Buffer.from(conf_enc, "base64").toString("utf8");
    const conf = JSON.parse(conf_raw);
    if (conf?.quota?.member_host === false) {
      L(`member_host is false -- renicing everything`);
      setPriority(process.pid, 18);
    }
  } catch (err) {
    // we report and ignore errors
    return L(`ERROR configure -- cannot process '${conf_enc}' -- ${err}`);
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
