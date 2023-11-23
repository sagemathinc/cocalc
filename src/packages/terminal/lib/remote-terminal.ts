/*
Terminal instance that runs on a remote machine.

This is a sort of simpler mirror image of terminal.ts.

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
import type { Channel } from "@cocalc/comm/websocket/types";
import { readlink, realpath } from "node:fs/promises";
import { EventEmitter } from "events";
import { getRemotePtyChannelName } from "./util";
import { REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS } from "./terminal";

// NOTE:  shorter than terminal.ts. This is like "2000 lines."
const MAX_HISTORY_LENGTH = 100 * 2000;

const logger = getLogger("terminal:remote");

type State = "init" | "ready" | "closed";

export class RemoteTerminal extends EventEmitter {
  private state: State = "init";
  private websocket;
  private path: string;
  private conn: Channel;
  private cwd?: string;
  private env?: object;
  private localPty?: IPty;
  private options?: Options;
  private size?: { rows: number; cols: number };
  private computeServerId?: number;
  private history: string = "";
  private lastData: number = 0;
  private healthCheckInterval;

  constructor(
    websocket,
    path,
    { cwd, env }: { cwd?: string; env?: object } = {},
    computeServerId?,
  ) {
    super();
    this.computeServerId = computeServerId;
    this.path = path;
    this.websocket = websocket;
    // offline and online and that's it!
    this.cwd = cwd;
    this.env = env;
    logger.debug("create ", { cwd });
    this.connect();
    this.healthChecks();
  }

  private healthChecks = () => {
    this.healthCheckInterval = setInterval(() => {
      if (
        Date.now() - this.lastData >=
          REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS + 3000 &&
        this.websocket.state == "online"
      ) {
        logger.debug("websocket online but no heartbeat so reconnecting");
        this.reconnect();
      }
    }, REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS + 3000);
  };

  private reconnect = () => {
    logger.debug("reconnect");
    this.conn.removeAllListeners();
    this.conn.end();
    this.connect();
  };

  private connect = () => {
    if (this.state == "closed") {
      return;
    }
    const name = getRemotePtyChannelName(this.path);
    logger.debug("connect: channel=", name);
    this.conn = this.websocket.channel(name);
    if (this.computeServerId != null) {
      logger.debug("connect: sending id", this.computeServerId);
      this.conn.write({ cmd: "setComputeServerId", id: this.computeServerId });
    }
    this.conn.on("data", async (data) => {
      // logger.debug("channel: data", data);
      try {
        await this.handleData(data);
      } catch (err) {
        logger.debug("error handling data -- ", err);
      }
    });
    this.conn.on("end", async () => {
      logger.debug("channel: closed");
    });
    this.conn.on("close", async () => {
      logger.debug("channel: closed");
      this.reconnect();
    });
    this.websocket.on("state", (state) => {
      logger.debug("websocket: state=", state);
    });
  };

  close = () => {
    this.state = "closed";
    this.emit("closed");
    this.removeAllListeners();
    this.conn.end();
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  };

  private handleData = async (data) => {
    if (this.state == "closed") return;
    this.lastData = Date.now();
    if (typeof data == "string") {
      if (this.localPty != null) {
        this.localPty.write(data);
      }
    } else {
      // console.log("COMMAND", data);
      switch (data.cmd) {
        case "init":
          this.options = data.options;
          this.size = data.size;
          await this.initLocalPty();
          logger.debug("sending history of length", this.history.length);
          this.conn.write(this.history);
          break;

        case "size":
          if (this.localPty != null) {
            this.localPty.resize(data.cols, data.rows);
          }
          break;

        case "cwd":
          await this.sendCurrentWorkingDirectoryLocalPty();
          break;

        case undefined:
          // logger.debug("received empty data (heartbeat)");
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
    const command = this.options.command ?? "/bin/bash";
    const args = this.options.args ?? [];
    const cwd = this.cwd ?? this.options.cwd;
    logger.debug("initLocalPty: spawn -- ", {
      command,
      args,
      cwd,
      size: this.size ? this.size : "size not defined",
    });

    const localPty = spawn(command, args, {
      cwd,
      env: { ...this.options.env, ...this.env },
      rows: this.size?.rows,
      cols: this.size?.cols,
    }) as IPty;
    this.state = "ready";
    logger.debug("initLocalPty: pid=", localPty.pid);

    localPty.onExit(() => {
      delete this.localPty; // no longer valid
      this.conn.write({ cmd: "exit" });
    });

    this.localPty = localPty;
    if (this.size) {
      this.localPty.resize(this.size.cols, this.size.rows);
    }

    localPty.onData((data) => {
      this.conn.write(data);

      this.history += data;
      const n = this.history.length;
      if (n >= MAX_HISTORY_LENGTH) {
        logger.debug("terminal data -- truncating");
        this.history = this.history.slice(n - MAX_HISTORY_LENGTH / 2);
      }
    });

    // set the prompt to show the remote hostname explicitly,
    // then clear the screen.
    this.localPty.write('PS1="(\\h) \\w$ ";reset;history -d $(history 1)\n');
  };

  private sendCurrentWorkingDirectoryLocalPty = async () => {
    if (this.localPty == null) {
      return;
    }
    // we reply with the current working directory of the underlying terminal process,
    // which is why we use readlink and proc below.
    // ** TODO: process.env.HOME probably doesn't make any sense here.. not sure?! **
    const pid = this.localPty.pid;
    const home = await realpath(process.env.HOME ?? "/home/user");
    const cwd = await readlink(`/proc/${pid}/cwd`);
    const path = cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
    logger.debug("terminal cwd sent back", { path });
    this.conn.write({ cmd: "cwd", payload: path });
  };
}
