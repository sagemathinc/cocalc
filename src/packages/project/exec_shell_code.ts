/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// import { getLogger } from "@cocalc/backend/logger";
// const winston = getLogger('exec-shell-code')

import { abspath } from "@cocalc/backend/misc_node";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import * as message from "@cocalc/util/message";
import { getLogger } from "./logger";
import execCode from "@cocalc/project/browser-websocket/exec-code";
import type { ExecuteCodeOutput } from "@cocalc/util/types/execute-code";

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
    const ret = handleExecShellCode(mesg);
    socket.write_mesg("json", message.project_exec_output(ret));
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

export async function handleExecShellCode(mesg) {
  const out = await execCode({
    path: !!mesg.compute_server_id ? mesg.path : abspath(mesg.path ?? ""),
    ...mesg,
  });
  let ret: ExecuteCodeOutput & { id: string } = {
    id: mesg.id,
    type: "blocking",
    stdout: out?.stdout,
    stderr: out?.stderr,
    exit_code: out?.exit_code,
  };
  if (out?.type === "async") {
    // extra fields for ExecuteCodeOutputAsync
    ret = {
      ...ret,
      ...out, // type=async, pid, status, job_id, stats, ...
    };
  }
  return ret;
}

