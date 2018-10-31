/*
X11 server channel.

TODO:
  - [ ] paste
  - [ ] copy
  - [ ] other user activity
*/

import { spawn } from "child_process";
import { callback } from "awaiting";

const x11_channels = {};

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
    logger
  }: {
    primus: any;
    path: string;
    name: string;
    logger: any;
  }) {
    this.logger = logger;
    this.log("creating new x11 channel");
    this.display = 0; // todo
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
    spark.on("data", async data => {
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

  async handle_data(spark, data): Promise<void> {
    this.log("handle_data ", data);
    if (typeof data !== "object") {
      return; // nothing defined yet
    }

    switch (data.cmd) {
      case "paste":
        await this.paste(data.value, data.wid ? data.wid : 0);
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
      `:${this.display}`
    ]);
    p.stdin.write(value);
    p.stdin.end();
    // wait for exit event.
    await callback(cb => p.on("exit", cb));
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
    spawn("xdotool", args, { env }).on("close", code => {
      console.log(`xdotool exited with code ${code}`);
    });
  }
}

export async function x11_channel(
  client: any,
  primus: any,
  logger: any,
  path: string
): Promise<string> {
  const name = `x11:${path}`;
  if (x11_channels[name] === undefined) {
    x11_channels[name] = new X11Channel({ primus, path, name, logger });
  }
  return name;
}
