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
import { spawn } from "@lydell/node-pty";
import type { Options, IPty } from "./types";
import type { Channel } from "@cocalc/comm/websocket/types";
import { readlink, realpath, writeFile } from "node:fs/promises";
import { EventEmitter } from "events";
import { getRemotePtyChannelName } from "./util";
import { REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS } from "./terminal";
import { throttle } from "lodash";
import { join } from "path";
import { delay } from "awaiting";

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
    this.cwd = cwd;
    this.env = env;
    logger.debug("create ", { cwd });
    this.connect();
    this.waitUntilHealthy();
  }

  // Why we do this initially is subtle.  Basically right when the user opens
  // a terminal, the project maybe hasn't set up anything, so there is no
  // channel to connect to.  The project then configures things, but it doesn't,
  // initially see this remote server, which already tried to connect to a channel
  // that I guess didn't exist.  So we check if we got any response at all, and if
  // not we try again, with exponential backoff up to 10s.   Once we connect
  // and get a response, we switch to about 10s heartbeat checking as usual.
  // There is probably a different approach to solve this problem, depending on
  // better understanding the async nature of channels, but this does work well.
  // Not doing this led to a situation where it always initially took 10.5s
  // to connect, which sucks!
  private waitUntilHealthy = async () => {
    let d = 250;
    while (this.state != "closed") {
      if (this.isHealthy()) {
        this.initRegularHealthChecks();
        return;
      }
      d = Math.min(10000, d * 1.25);
      await delay(d);
    }
  };

  private isHealthy = () => {
    if (this.state == "closed") {
      return true;
    }
    if (
      Date.now() - this.lastData >=
        REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS + 3000 &&
      this.websocket.state == "online"
    ) {
      logger.debug("websocket online but no heartbeat so reconnecting");
      this.reconnect();
      return false;
    }
    return true;
  };

  private initRegularHealthChecks = () => {
    this.healthCheckInterval = setInterval(
      this.isHealthy,
      REMOTE_TERMINAL_HEARTBEAT_INTERVAL_MS + 3000,
    );
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
    logger.debug(this.path, "connect: channel=", name);
    this.conn = this.websocket.channel(name);
    this.conn.on("data", async (data) => {
      // DO NOT LOG EXCEPT FOR VERY LOW LEVEL TEMPORARY DEBUGGING!
      // logger.debug(this.path, "channel: data", data);
      try {
        await this.handleData(data);
      } catch (err) {
        logger.debug(this.path, "error handling data -- ", err);
      }
    });
    this.conn.on("end", async () => {
      logger.debug(this.path, "channel: end");
    });
    this.conn.on("close", async () => {
      logger.debug(this.path, "channel: close");
      this.reconnect();
    });
    if (this.computeServerId != null) {
      logger.debug(
        this.path,
        "connect: sending computeServerId =",
        this.computeServerId,
      );
      this.conn.write({ cmd: "setComputeServerId", id: this.computeServerId });
    }
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
      } else {
        logger.debug("no pty active, but got data, so let's spawn one locally");
        const pty = await this.initLocalPty();
        if (pty != null) {
          // we delete first character since it is the "any key"
          // user hit to get terminal going.
          pty.write(data.slice(1));
        }
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
      this.saveHistoryToDisk();
    });

    // set the prompt to show the remote hostname explicitly,
    // then clear the screen.
    if (command == "/bin/bash") {
      this.localPty.write('PS1="(\\h) \\w$ ";reset;history -d $(history 1)\n');
      // alternative -- this.localPty.write('PS1="(\\h) \\w$ "\n');
    }

    return this.localPty;
  };

  private getHome = () => {
    return this.env?.["HOME"] ?? process.env.HOME ?? "/home/user";
  };

  private sendCurrentWorkingDirectoryLocalPty = async () => {
    if (this.localPty == null) {
      return;
    }
    // we reply with the current working directory of the underlying
    // terminal process, which is why we use readlink and proc below.
    const pid = this.localPty.pid;
    const home = await realpath(this.getHome());
    const cwd = await readlink(`/proc/${pid}/cwd`);
    const path = cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
    logger.debug("terminal cwd sent back", { path });
    this.conn.write({ cmd: "cwd", payload: path });
  };

  private saveHistoryToDisk = throttle(async () => {
    const target = join(this.getHome(), this.path);
    try {
      await writeFile(target, this.history);
    } catch (err) {
      logger.debug(
        `WARNING: failed to save terminal history to '${target}'`,
        err,
      );
    }
  }, 15000);
}

