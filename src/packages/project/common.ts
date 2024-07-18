/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { to_json, trunc } from "@cocalc/util/misc";

import { getLogger } from "./logger";
const winston = getLogger("common");

function envVarToInt(name: string, fallback: number): number {
  const x = process.env[name];
  if (x == null) {
    return fallback;
  }
  const y = parseInt(x);
  if (isNaN(y)) {
    return fallback;
  }
  return y;
}

// We make it an error for a client to try to edit a file larger than MAX_FILE_SIZE.
// I decided on this, because attempts to open a much larger file leads
// to disaster.  Opening a 10MB file works but is a just a little slow.
const MAX_FILE_SIZE =
  1000 * 1000 * envVarToInt("COCALC_PROJECT_MAX_FILE_SIZE_MB", 10); // in bytes
winston.debug(`MAX_FILE_SIZE = ${MAX_FILE_SIZE} bytes`);

export function check_file_size(size): string | undefined {
  if (size != null && size > MAX_FILE_SIZE) {
    const e = `Attempt to open large file of size ${Math.round(
      size / 1000000
    )}MB; the maximum allowed size is ${Math.round(
      MAX_FILE_SIZE / 1000000
    )}MB. Use vim, emacs, or pico from a terminal instead.`;
    winston.debug(e);
    return e;
  }
}

export function json(out): string {
  return trunc(to_json(out), 500);
}
