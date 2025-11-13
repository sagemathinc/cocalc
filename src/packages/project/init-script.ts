/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This runs a script configured via the --init [str] parameter.
*/

import { spawn } from "node:child_process";
import { openSync, constants } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { access } from "node:fs/promises";

import { change_filename_extension } from "@cocalc/util/misc";

import { getOptions } from "./init-program";
import { getLogger } from "./logger";

const { info } = getLogger("init-script");

export async function run() {
  if (!getOptions().init) return;

  const initScript = join(homedir(), getOptions().init);

  try {
    await access(initScript, constants.R_OK);
  } catch {
    info(`"${initScript}" does not exist`);
    return;
  }

  try {
    info(`running "${initScript}"`);

    const out = openSync(change_filename_extension(initScript, "log"), "w");
    const err = openSync(change_filename_extension(initScript, "err"), "w");

    // we don't detach the process, because otherwise it stays around when restarting the project
    spawn("bash", [initScript], {
      stdio: ["ignore", out, err],
    });
  } catch (err) {
    info(`Problem running "${initScript}" -- ${err}`);
  }
}
