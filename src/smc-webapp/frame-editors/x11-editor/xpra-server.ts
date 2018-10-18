/*
Control backend Xpra server daemon
*/

import { exec } from "../generic/client";
import { reuseInFlight } from "async-await-utils/hof";
import { MAX_WIDTH, MAX_HEIGHT } from "./xpra-client";
import { splitlines, split } from "../generic/misc";

// this will break annoying on cocalc-docker
// if there are multiple projects using it at once.
const DEFAULT_DISPLAY = 0;
const DEFAULT_COMMAND = "gnome-terminal";

interface XpraServerOptions {
  project_id: string;
  command?: string;
  display?: number;
}

export class XpraServer {
  private project_id: string;
  private display: number;
  private command: string;

  constructor(opts: XpraServerOptions) {
    this.project_id = opts.project_id;
    this.display = opts.display ? opts.display : DEFAULT_DISPLAY;
    this.command = opts.command ? opts.command : DEFAULT_COMMAND;
    this.start = reuseInFlight(this.start);
    this.stop = reuseInFlight(this.stop);
    this.get_port = reuseInFlight(this.get_port);
    this.pgrep = reuseInFlight(this.pgrep);
  }

  // Returns the port it is running on.
  async start(): Promise<number> {
    let port = await this.get_port();
    if (port) {
      return port;
    }
    for (let i = 0; i < 20; i++) {
      port = Math.round(1000 + Math.random() * 64000);
      try {
        await this._start(port);
        return port; // it worked -- no exception
      } catch (err) {
        console.log("random port failed; trying another...", err);
      }
    }
    throw Error("unable to start xpra server");
  }

  private async _start(port: number): Promise<void> {
    const XVFB = `/usr/bin/Xvfb +extension Composite -screen 0 ${MAX_WIDTH}x${MAX_HEIGHT}x24+32 -nolisten tcp -noreset`;
    const command = "xpra";
    const args = [
      "start",
      `:${this.display}`,
      "-d",
      "all",
      "--pulseaudio=no",
      "--bell=no",
      "--sharing=yes",
      "--microphone=off",
      "--av-sync=no",
      "--speaker=off",
      "--terminate-children=yes",
      `--bind-tcp=0.0.0.0:${port}`,
      "--html=/tmp" /* just to make it serve the websocket; path isn't actually used.  Must be absolute */,
      `--start="${this.command}"`,
      "--daemon=yes",
      `--xvfb=${XVFB}`
    ];
    await exec({
      project_id: this.project_id,
      command,
      args,
      err_on_exit: true,
      timeout: 30,
      network_timeout: 30
    });
  }

  async stop(): Promise<void> {
    const line = await this.pgrep();
    if (line === "") {
      return;
    }
    await exec({
      project_id: this.project_id,
      command: "kill",
      args: [split(line)[0]]
    });
  }

  private async pgrep(): Promise<string> {
    const { stdout, exit_code } = await exec({
      project_id: this.project_id,
      command: "pgrep",
      args: ["-a", "xpra"],
      err_on_exit: false
    });
    if (exit_code !== 0) {
      return "";
    }
    for (let line of splitlines(stdout)) {
      console.log(`start :${this.display}`, line);
      if (line.indexOf(`start :${this.display}`) !== -1) {
        return line;
      }
    }
    return "";
  }

  async is_running(): Promise<boolean> {
    // The following is not as robust as using "xpra info", but it is
    // a thousand times faster (literally).
    return (await this.pgrep()) !== "";
  }

  async get_port(): Promise<number | undefined> {
    const line = await this.pgrep();
    const i = line.indexOf(`bind-tcp=0.0.0.0:`);
    if (i === -1) {
      return;
    }
    const j = line.indexOf(":", i);
    const k = line.indexOf(" ", j);
    if (j === -1 || k === -1) {
      return;
    }
    return parseInt(line.slice(j + 1, k));
  }
}
