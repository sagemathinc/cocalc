/*
Quick very simple terminal proof of concept for testing NATS
*/

import { spawn } from "node-pty";
import { envForSpawn } from "@cocalc/backend/misc";
import { path_split } from "@cocalc/util/misc";
import { getCWD } from "@cocalc/terminal/lib/util";
import { console_init_filename } from "@cocalc/util/misc";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { project_id } from "@cocalc/project/data";
import { sha1 } from "@cocalc/backend/sha1";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const DEFAULT_COMMAND = "/bin/bash";

const sessions: { [name: string]: Session } = {};

export const createTerminal = reuseInFlight(
  async ({ params, nc }: { params; nc }) => {
    if (params == null) {
      throw Error("params must be specified");
    }
    const { path, options } = params;
    if (!path) {
      throw Error("path must be specified");
    }
    if (sessions[path] == null) {
      sessions[path] = new Session({ path, options, nc });
      await sessions[path].init();
    }
    return sessions[path].subject;
  },
  {
    createKey: (args) => {
      return args[0]?.params?.path ?? "";
    },
  },
);

export function writeToTerminal({ data, path }: { data; path }) {
  sessions[path]?.write(data);
}

class Session {
  private nc;
  private path: string;
  private options?;
  private pty?;
  private size?: { rows: number; cols: number };
  // the subject where we publish our output
  public subject: string;

  constructor({ path, options, nc }) {
    this.nc = nc;
    this.path = path;
    this.options = options;
    this.subject = `project.${project_id}.terminal.${sha1(path)}`;
  }

  write = (data) => {
    if (this.pty == null) {
      return;
    }
    this.pty?.(data);
  };

  init = async () => {
    const { head, tail } = path_split(this.path);
    const env = {
      COCALC_TERMINAL_FILENAME: tail,
      ...envForSpawn(),
      ...this.options?.env,
      TMUX: undefined, // ensure not set
    };
    const command = this.options?.command ?? DEFAULT_COMMAND;
    const args = this.options.args ?? [];
    const initFilename: string = console_init_filename(this.path);
    if (await exists(initFilename)) {
      args.push("--init-file");
      args.push(path_split(initFilename).tail);
    }
    const cwd = getCWD(head, this.options?.cwd);
    this.pty = spawn(command, args, {
      cwd,
      env,
      rows: this.size?.rows,
      cols: this.size?.cols,
    });

    this.pty.onData((data) => {
      this.nc.publish(this.subject, data);
    });
    this.pty.onExit(() => {
      // todo
      console.log("exit");
    });
  };
}
