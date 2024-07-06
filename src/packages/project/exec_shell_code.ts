/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// import { getLogger } from "@cocalc/backend/logger";
// const winston = getLogger('exec-shell-code')

import { abspath } from "@cocalc/backend/misc_node";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import * as message from "@cocalc/util/message";
import { getLogger } from "./logger";
import execCode from "@cocalc/project/browser-websocket/exec-code";

const { debug: D } = getLogger("exec_shell_code");

export async function exec_shell_code(socket: CoCalcSocket, mesg) {
  //winston.debug("project_exec: #{misc.to_json(mesg)} in #{process.cwd()}")
  if (mesg.command === "smc-jupyter") {
    socket.write_mesg(
      "json",
      message.error({ id: mesg.id, error: "do not run smc-jupyter directly" }),
    );
    return;
  }

  D(`command=${mesg.command} args=${mesg.args} path=${mesg.path}`);

  try {
    const out = await execCode({
      path: !!mesg.compute_server_id
        ? mesg.path
        : abspath(mesg.path != null ? mesg.path : ""),
      ...mesg,
    });
    socket.write_mesg(
      "json",
      message.project_exec_output({
        id: mesg.id,
        stdout: out?.stdout,
        stderr: out?.stderr,
        exit_code: out?.exit_code,
      }),
    );
  } catch (err) {
    let error = `Error executing command '${mesg.command}' with args '${mesg.args}' -- ${err}`;
    if (error.indexOf("Connection refused") !== -1) {
      error +=
        "-- Email help@cocalc.com if you need full internet access, which is disabled by default.";
    }
    // Too annoying and doesn't work.
    //if error.indexOf("=") != -1
    //    error += "-- This is a BASH terminal, not a Sage worksheet.  For Sage, use +New and create a Sage worksheet."
    const err_mesg = message.error({
      id: mesg.id,
      error,
    });
    socket.write_mesg("json", err_mesg);
  }
}
