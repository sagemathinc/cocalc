/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
X11 server channel.

TODO:
  - [ ] other user activity
  - [ ] when stopping project, kill xpra's
*/

import { spawn, SpawnOptions } from "child_process";
import { callback } from "awaiting";
const { abspath } = require("smc-util-node/misc_node");
const { path_split } = require("smc-util/misc");
import { clone } from "underscore";

const x11_channels = {};

// this is used to map a (not necessarily) running process to a path for the "project info"
const pid2path: { [pid: number]: string } = {};

export function get_path_for_pid(pid: number) {
  return pid2path[pid];
}

class X11Channel {
  logger: any;
  display: number;
  path: string;
  name: string;
  channel: any;
  clip: any;

  constructor({
    primus,
    path,
    name,
    logger,
    display,
  }: {
    primus: any;
    path: string;
    name: string;
    logger: any;
    display: number;
  }) {
    this.logger = logger;
    this.log("creating new x11 channel");
    this.display = display; // needed for copy/paste support
    this.path = path;
    this.name = name;
    this.channel = primus.channel(this.name);
    this.init_handlers();
  }

  log(...args): void {
    this.logger.debug(`x11 channel ${this.path} -- `, ...args);
  }

  new_connection(spark: any): void {
    if (this.channel === undefined) {
      return;
    }
    // Now handle the connection
    this.log(`new connection from ${spark.address.ip} -- ${spark.id}`);
    spark.on("data", async (data) => {
      try {
        await this.handle_data(spark, data);
      } catch (err) {
        spark.write({ error: `error handling command -- ${err}` });
      }
    });
  }

  init_handlers(): void {
    this.channel.on("connection", this.new_connection.bind(this));
  }

  async handle_data(_, data): Promise<void> {
    this.log("handle_data ", data);
    if (typeof data !== "object") {
      return; // nothing defined yet
    }

    switch (data.cmd) {
      case "paste":
        await this.paste(data.value, data.wid ? data.wid : 0);
        break;
      case "launch":
        await this.launch(data.command, data.args);
        break;
      default:
        throw Error("WARNING: unknown command -- " + data.cmd);
    }
  }

  async paste(value: string, wid: number): Promise<void> {
    this.log("paste", value, wid);
    await this.set_clipboard(value);
    await this.cause_paste(wid);
  }

  async set_clipboard(value: string): Promise<void> {
    this.log("set_clipboard to string of length", value.length);
    const p = spawn("xclip", [
      "-selection",
      "clipboard",
      "-d",
      `:${this.display}`,
    ]);
    p.stdin.write(value);
    p.stdin.end();
    // wait for exit event.
    await callback((cb) => p.on("exit", cb));
  }

  cause_paste(wid: number): void {
    this.log("paste to window ", wid);
    const env = { DISPLAY: `:${this.display}` };
    const args: string[] = ["key", "Control_L+v"];
    if (wid) {
      args.push("--window");
      args.push(`${wid}`);
    }
    this.log("xdotool", args);
    spawn("xdotool", args, { env }).on("close", (code) => {
      console.log(`xdotool exited with code ${code}`);
    });
  }

  // launch a command and detach -- used to start x11 applications running.
  launch(command: string, args?: string[]): void {
    const env = clone(process.env);
    env.DISPLAY = `:${this.display}`;
    const cwd = this.get_cwd();
    const options: SpawnOptions = { cwd, env, detached: true, stdio: "ignore" };
    args = args != null ? args : [];
    try {
      const sub = spawn(command, args, options);
      sub.unref();
      pid2path[sub.pid] = this.path;
      sub.on("exit", () => {
        delete pid2path[sub.pid];
      });
    } catch (err) {
      this.channel.write({
        error: `error launching ${command} -- ${err}`,
      });
      return;
    }
  }

  private get_cwd(): string {
    return path_split(abspath(this.path)).head; // containing path
  }
}

export async function x11_channel(
  _: any,
  primus: any,
  logger: any,
  path: string,
  display: number
): Promise<string> {
  const name = `x11:${path}`;
  if (x11_channels[name] === undefined) {
    x11_channels[name] = new X11Channel({
      primus,
      path,
      name,
      logger,
      display,
    });
  }
  return name;
}
