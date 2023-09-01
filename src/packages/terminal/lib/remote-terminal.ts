/*
Terminal instance that runs on a remote machine.

This provides a terminal via the "remotePty" mechanism to a project.
The result feels a bit like "ssh'ing to a remote machine", except
the connection comes from the outside over a websocket.  When you're
actually using it, though, it's identical to if you ssh out.

[remote.ts Terminal] ------------> [Project]

This works in conjunction with src/compute/compute/terminal
*/

import getLogger from "@cocalc/backend/logger";
import { spawn } from "node-pty";
import type { Options, PrimusChannel, IPty } from "./types";

const logger = getLogger("terminal:remote");

export class RemoteTerminal {
  private channel: PrimusChannel;
  private cwd?: string;
  private localPty?: IPty;
  private options?: Options;
  private size?: { rows: number; cols: number };

  constructor(channel, cwd) {
    this.channel = channel;
    this.channel.on("data", this.handleData);
    this.cwd = cwd;
    logger.debug("create ", { cwd });
  }

  private handleData = async (data) => {
    if (typeof data == "string") {
      if (this.localPty != null) {
        this.localPty.write(data);
      }
    } else {
      // console.log("command", data);
      switch (data.cmd) {
        case "init":
          this.options = data.options;
          this.size = data.size;
          await this.initLocalPty();
          break;
        case "size":
          if (this.localPty != null) {
            this.localPty.resize(data.cols, data.rows);
          }
          break;
      }
    }
  };

  private initLocalPty = async () => {
    if (this.options == null) {
      return;
    }
    if (this.localPty != null) {
      return;
    }
    const localPty = spawn(
      this.options.command ?? "/bin/bash",
      this.options.args ?? [],
      { cwd: this.cwd ?? this.options.cwd, env: this.options.env },
    ) as IPty;
    logger.debug("initLocalPty: pid=", localPty.pid);
    localPty.on("data", (data) => {
      this.channel.write(data);
    });
    this.localPty = localPty;
    if (this.size) {
      this.localPty.resize(this.size.cols, this.size.rows);
    }
  };
}
