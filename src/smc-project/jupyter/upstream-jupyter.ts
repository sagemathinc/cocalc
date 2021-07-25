/*
Start official upstream Jupyter(Lab) server if necessary, then send a message
to the hub with the port the server is serving on.

This is used by the proxy server to route a certain URL to jupyter(lab).

- socket -- TCP connection between project and hub
- mesg -- the message from the hub requesting the jupyter port.
*/

import { promisify } from "util";
import { exec as fs_exec } from "child_process";
import { getLogger } from "smc-project/logger";
import { reuseInFlight } from "async-await-utils/hof";
import * as message from "smc-util/message";

const exec = promisify(fs_exec);
const winston = getLogger("upstream-jupyter");

const jupyter_port = reuseInFlight(
  async (socket, mesg) => {
    const lab = !!mesg.lab;
    let s: { port?: number; status?: string } = await status(lab);
    try {
      winston.debug(`jupyter_port, lab=${lab}, status = ${JSON.stringify(s)}`);
      if (!s.port || s.status != "running") {
        winston.debug("jupyter_port: not running so start");
        s = await start(lab);
      }
    } catch (err) {
      const error = `error starting jupyter -- ${err}`;
      socket.write_mesg("json", message.error({ id: mesg.id, error }));
      return;
    }
    socket.write_mesg(
      "json",
      message.jupyter_port({ id: mesg.id, port: s.port, lab })
    );
  },
  { createKey: (args) => `${args[2]}` }
);
export default jupyter_port;

async function cmd(arg: string, lab: boolean) {
  const command = `cc-jupyter${lab ? "lab" : ""} ${arg}`;
  winston.debug(command);
  return await exec(command);
}

async function start(
  lab: boolean
): Promise<{ base: string; pid: number; port: number }> {
  const { stdout } = await cmd("start", lab);
  return JSON.parse(stdout);
}

async function status(
  lab: boolean
): Promise<{ status: "stopped" | "running"; port?: number }> {
  try {
    const { stdout } = await cmd("status", lab);
    return JSON.parse(stdout);
  } catch (err) {
    return { status: "stopped" };
  }
}
