import { project } from "@cocalc/api-client";
import SyncClient from "@cocalc/sync-client";
import getLogger from "@cocalc/backend/logger";
import { getRemotePtyChannelName } from "@cocalc/terminal";
import type { IPty } from "@cocalc/terminal";
import { spawn } from "node-pty";
import type {
  Options as TerminalOptions,
  PrimusChannel,
} from "@cocalc/terminal/lib/types";

const logger = getLogger("compute:terminal");

interface Options {
  // which project -- defaults to process.env.PROJECT_ID, which must be given if this isn't
  project_id?: string;
  // path of terminal -- NOT optional
  path: string;
  // optional directory to change to before starting session
  cwd?: string;
}

// path should be something like "foo/.bar.term"
// This particular code for now is just about making one single frame
// use a remote terminal.  We will of course be building much more on this.
// This is basically the foundational proof of concept step.
export async function terminal({
  project_id = process.env.PROJECT_ID,
  path,
  cwd,
}: Options) {
  if (!project_id) {
    throw Error("project_id or process.env.PROJECT_ID must be given");
  }
  const log = (...args) => logger.debug(path, ...args);
  log();
  await project.ping({ project_id });

  // Get a websocket connection to the project:
  const client = new SyncClient();
  log("getting websocket connection to project", project_id);
  const ws = await client.project_client.websocket(project_id);

  const name = getRemotePtyChannelName(path);
  log("opening channel", name);
  const channel = ws.channel(name);
  const term = new Terminal(channel, cwd);
  return term;
}

class Terminal {
  private channel: PrimusChannel;
  private cwd?: string;
  private localPty?: IPty;
  private options?: TerminalOptions;
  private size?: { rows: number; cols: number };

  constructor(channel, cwd) {
    this.channel = channel;
    this.channel.on("data", this.handleData);
    this.cwd = cwd;
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
    logger.debug("pid=", localPty.pid);
    localPty.on("data", (data) => {
      this.channel.write(data);
    });
    this.localPty = localPty;
    if (this.size) {
      this.localPty.resize(this.size.cols, this.size.rows);
    }
  };
}
