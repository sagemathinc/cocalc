/*
Control backend Xpra server daemon
*/

import { exec } from "../generic/client";
import { reuseInFlight } from "async-await-utils/hof";
import { MAX_WIDTH, MAX_HEIGHT } from "./xpra/surface";
import { splitlines, split } from "../generic/misc";

// This will break annoyingly on cocalc-docker
// if there are multiple projects using it at once.
const DEFAULT_DISPLAY = 0;

interface XpraServerOptions {
  project_id: string;
  command?: string;
  display?: number;
}

export class XpraServer {
  private project_id: string;
  private display: number;
  private state: string = "ready";
  private hostname: string = "";

  constructor(opts: XpraServerOptions) {
    this.project_id = opts.project_id;
    try {
      this.get_hostname(); // start trying...
    } catch (err) {
      console.warn("xpra: Failed to get hostname.");
    }
    this.display = opts.display ? opts.display : DEFAULT_DISPLAY;
    this.start = reuseInFlight(this.start);
    this.stop = reuseInFlight(this.stop);
    this.get_port = reuseInFlight(this.get_port);
    this.get_hostname = reuseInFlight(this.get_hostname);
    this.pgrep = reuseInFlight(this.pgrep);
  }

  destroy(): void {
    this.state = "destroyed";
  }

  // Returns the port it is running on, or 0 if destroyed before finding one...
  async start(): Promise<number> {
    let port = await this.get_port();
    if (port) {
      return port;
    }
    for (let i = 0; i < 20; i++) {
      if (this.state === "destroyed") {
        return 0;
      }
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

  // I've noticed that often Xvfb will get left running, and then
  // xpra will *never* start unless you manually kill it. It's much
  // better to just ensure it is dead.
  private async _kill_Xvfb(): Promise<void> {
    const { stdout, exit_code } = await exec({
      project_id: this.project_id,
      command: "pgrep",
      args: ["-a", "Xvfb"],
      err_on_exit: false
    });
    if (exit_code !== 0) {
      return;
    }
    for (let line of splitlines(stdout)) {
      if (line.indexOf(`Xvfb-for-Xpra-:${this.display}`) !== -1) {
        const pid = line.split(" ")[0];
        await exec({
          project_id: this.project_id,
          command: "kill",
          args: ["-9", pid],
          err_on_exit: false
        });
        return;
      }
    }
  }

  private async _start(port: number): Promise<void> {
    await this._kill_Xvfb();
    const XVFB = `/usr/bin/Xvfb +extension Composite -screen 0 ${MAX_WIDTH}x${MAX_HEIGHT}x24+32 -nolisten tcp -noreset`;
    const command = "xpra";
    const args = [
      "start",
      `:${this.display}`,
      //"-d",
      //"all",
      "--socket-dir=/tmp/xpra",
      "--no-keyboard-sync" /* see https://xpra.org/trac/wiki/Keyboard */,
      "--pulseaudio=no",
      "--bell=no",
      "--sharing=yes",
      "--microphone=off",
      "--av-sync=no",
      "--speaker=off",
      "--terminate-children=yes",
      `--bind-tcp=0.0.0.0:${port}`,
      "--html=/tmp" /* just to make it serve the websocket; path isn't actually used.  Must be absolute */,
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

  get_display(): number {
    return this.display;
  }

  async get_hostname(): Promise<string> {
    const { stdout } = await exec({
      project_id: this.project_id,
      command: "hostname",
      err_on_exit: true
    });
    return (this.hostname = stdout.trim());
  }

  get_socket_path(): string {
    let hostname = this.hostname;
    if (!hostname) {
      // this will fail if hostname hasn't been set yet via an async call
      // and NOT in kucalc (where there hostname is canonical).
      if ((window as any).app_base_url) {
        // cocalc-in-cocalc dev
        hostname = `project-${(window as any).app_base_url.slice(1, 37)}`;
      } else {
        // kucalc
        hostname = `project-${this.project_id}`;
      } // else -- it won't work.
    }
    return `/tmp/xpra/${hostname}-${this.display}`;
  }
}
