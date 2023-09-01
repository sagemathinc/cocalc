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
import type { Options, IPty } from "./types";
import type { Spark } from "primus";

const logger = getLogger("terminal:remote");

type State = "init" | "ready" | "closed";

export class RemoteTerminal {
  private state: State = "init";
  private conn: Spark;
  private cwd?: string;
  private localPty?: IPty;
  private options?: Options;
  private size?: { rows: number; cols: number };

  constructor(conn, cwd?) {
    this.conn = conn;
    this.conn.on("data", this.handleData);
    this.cwd = cwd;
    logger.debug("create ", { cwd });
  }

  close = () => {
    this.state = "closed";
    this.conn.end();
  };

  private handleData = async (data) => {
    if (this.state == "closed") return;
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
    if (this.state == "closed") return;
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
    this.state = "ready";
    logger.debug("initLocalPty: pid=", localPty.pid);
    localPty.on("data", (data) => {
      this.conn.write(data);
    });
    this.localPty = localPty;
    if (this.size) {
      this.localPty.resize(this.size.cols, this.size.rows);
    }
  };
}
