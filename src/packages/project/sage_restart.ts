/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { executeCode } from "@cocalc/backend/execute-code";
import { getLogger } from "@cocalc/backend/logger";
import { to_json } from "@cocalc/util/misc";

const winston = getLogger("sage-restart");

// Wait up to this long for the Sage server to start responding
// connection requests, after we restart it.  It can
// take a while, since it pre-imports the sage library
// at startup, before forking.
export const SAGE_SERVER_MAX_STARTUP_TIME_S = 60;

let restarting = false;
let restarted = 0; // time when we last restarted it

export async function restartSageServer() {
  const dbg = (m) => winston.debug(`restartSageServer: ${to_json(m)}`);
  if (restarting) {
    dbg("hit lock");
    throw new Error("already restarting sage server");
  }

  const t = Date.now() - restarted;

  if (t <= SAGE_SERVER_MAX_STARTUP_TIME_S * 1000) {
    const err = `restarted sage server ${t}ms ago: not allowing too many restarts too quickly...`;
    dbg(err);
    throw new Error(err);
  }

  restarting = true;

  dbg("restarting the daemon");

  try {
    const output = await executeCode({
      command: "smc-sage-server restart",
      timeout: 45,
      ulimit_timeout: false, // very important -- so doesn't kill after 30 seconds of cpu!
      err_on_exit: true,
      bash: true,
    });
    dbg(
      `successfully restarted sage server daemon -- '${JSON.stringify(output)}'`
    );
  } catch (err) {
    const msg = `failed to restart sage server daemon -- ${err}`;
    dbg(msg);
    throw new Error(msg);
  } finally {
    restarting = false;
    restarted = Date.now();
  }
}
