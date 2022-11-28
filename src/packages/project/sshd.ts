/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This starts an sshd server used for accessing the project via an ssh gateway server

Ref.: https://nodejs.org/docs/latest-v16.x/api/child_process.html#optionsdetached
*/

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { getLogger } from "./logger";
import { SSH_LOG, SSH_ERR } from "./data";

const { info } = getLogger("sshd");

export async function init() {
  info("starting sshd");

  const out = openSync(SSH_LOG, "a");
  const err = openSync(SSH_ERR, "a");

  const sshd = spawn("bash", ["/cocalc/kucalc-start-sshd.sh"], {
    detached: true,
    stdio: ["ignore", out, err],
  });

  sshd.unref();
}
