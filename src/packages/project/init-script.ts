/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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

import { options } from "./init-program";
import { getLogger } from "./logger";

const { info } = getLogger("init-script");

export async function run() {
  if (!options.init) return;

  const initScript = join(homedir(), options.init);

  try {
    await access(initScript, constants.R_OK);
    info(`running "${initScript}"`);

    const out = openSync(change_filename_extension(initScript, "log"), "a");
    const err = openSync(change_filename_extension(initScript, "err"), "a");

    const initProcess = spawn("bash", [initScript], {
      detached: true,
      stdio: ["ignore", out, err],
    });

    initProcess.unref();
  } catch {
    info(`"${initScript}" does not exist`);
  }
}
