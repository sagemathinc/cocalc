/*
Quick very simple terminal proof of concept for testing NATS
*/

import { spawn } from "node-pty";
import { envForSpawn } from "@cocalc/backend/misc";
import { path_split } from "@cocalc/util/misc";
import { console_init_filename } from "@cocalc/util/misc";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { project_id } from "@cocalc/project/data";
import { sha1 } from "@cocalc/backend/sha1";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { JSONCodec } from "nats";
import { /*jetstream,*/ jetstreamManager } from "@nats-io/jetstream";

const EXIT_MESSAGE = "\r\n\r\n[Process completed - press any key]\r\n\r\n";
const DEFAULT_COMMAND = "/bin/bash";
const jc = JSONCodec();

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
    return { subject: sessions[path].subject };
  },
  {
    createKey: (args) => {
      return args[0]?.params?.path ?? "";
    },
  },
);

export async function writeToTerminal({ data, path }: { data; path }) {
  const terminal = sessions[path];
  if (terminal == null) {
    throw Error(`no terminal session '${path}'`);
  }
  await terminal.write(data);
  return { success: true };
}

export async function restartTerminal({ path }: { path }) {
  const terminal = sessions[path];
  if (terminal == null) {
    throw Error(`no terminal session '${path}'`);
  }
  await terminal.restart();
  return { success: true };
}

class Session {
  private nc;
  private path: string;
  private options;
  private pty?;
  private size?: { rows: number; cols: number };
  // the subject where we publish our output
  public subject: string;
  private state: "running" | "off" = "off";
  private streamName: string;

  constructor({ path, options, nc }) {
    this.nc = nc;
    this.path = path;
    this.options = options ?? {};
    this.subject = `project.${project_id}.terminal.${sha1(path)}`;
    this.streamName = `project-${project_id}-terminal`;
  }

  write = async (data) => {
    console.log("write", { data });
    if (this.state == "off") {
      await this.restart();
    }
    this.pty?.write(data);
  };

  restart = async () => {
    this.pty?.destroy();
    delete this.pty;
    await this.init();
  };

  getStream = async () => {
    // idempotent so don't have to check if there is already a stream
    const nc = this.nc;
    const jsm = await jetstreamManager(nc);
    await jsm.streams.add({
      name: this.streamName,
      subjects: [`project.${project_id}.terminal.>`],
      compression: "s2",
    });
  };

  init = async () => {
    const { head, tail } = path_split(this.path);
    const env = {
      COCALC_TERMINAL_FILENAME: tail,
      ...envForSpawn(),
      ...this.options.env,
      TMUX: undefined, // ensure not set
    };
    const command = this.options.command ?? DEFAULT_COMMAND;
    const args = this.options.args ?? [];
    const initFilename: string = console_init_filename(this.path);
    if (await exists(initFilename)) {
      args.push("--init-file");
      args.push(path_split(initFilename).tail);
    }
    const cwd = getCWD(head, this.options.cwd);
    this.pty = spawn(command, args, {
      cwd,
      env,
      rows: this.size?.rows,
      cols: this.size?.cols,
    });
    this.state = "running";
    await this.getStream();
    //const js = await jetstream(this.nc);
    this.pty.onData(async (data) => {
      // console.log("onData", { data });
      //await js.publish(this.streamName, jc.encode({ data }));
      this.nc.publish(this.subject, jc.encode({ data }));
    });
    this.pty.onExit((status) => {
      this.nc.publish(this.subject, jc.encode({ data: EXIT_MESSAGE }));
      this.nc.publish(this.subject, jc.encode({ ...status, exit: true }));
      this.state = "off";
    });
  };
}

function getCWD(pathHead, cwd?): string {
  // working dir can be set explicitly, and either be an empty string or $HOME
  if (cwd != null) {
    const HOME = process.env.HOME ?? "/home/user";
    if (cwd === "") {
      return HOME;
    } else if (cwd.startsWith("$HOME")) {
      return cwd.replace("$HOME", HOME);
    } else {
      return cwd;
    }
  }
  return pathHead;
}
