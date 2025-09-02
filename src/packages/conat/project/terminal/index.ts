/*
Terminal
*/

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import {
  type ConatSocketServer,
  type ServerSocket,
} from "@cocalc/conat/socket";
import { getLogger } from "@cocalc/conat/client";
import { ThrottleString } from "@cocalc/util/throttle";
import { delay } from "awaiting";
import {
  createPtyWritable,
  writeToWritablePty,
  type Writable,
} from "./writable-pty";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const MAX_MSGS_PER_SECOND = parseInt(
  process.env.COCALC_TERMINAL_MAX_MSGS_PER_SECOND ?? "24",
);

const MAX_HISTORY_LENGTH = parseInt(
  process.env.COCALC_TERMINAL_MAX_HISTORY_LENGTH ?? "1000000",
);

const DEFAULT_SIZE_WAIT = 2000;

import { EventEmitter } from "events";

const logger = getLogger("conat:project:terminal");

function getSubject({
  project_id,
  compute_server_id = 0,
}: {
  project_id: string;
  compute_server_id?: number;
}) {
  return `terminal.project-${project_id}.${compute_server_id}`;
}

export interface Options {
  cwd?: string;
  env?: { [key: string]: string };
  // env0 is merged into existing environment, whereas env makes a new environment
  env0?: { [key: string]: string };
  rows?: number;
  cols?: number;
  handleFlowControl?: boolean;
  id?: string;
}

export function terminalServer({
  client,
  project_id,
  compute_server_id = 0,
  spawn,
  cwd,
  preHook,
  postHook,
}: {
  client: ConatClient;
  project_id: string;
  compute_server_id?: number;
  // spawn a pseudo tty:
  spawn: (
    command: string,
    args?: string[],
    options?: Options,
  ) => Promise<{ pid: number }>;
  // get the current working directory of the process with given pid
  cwd?: (pid: number) => Promise<string | undefined>;
  preHook?: (opts: {
    command: string;
    args?: string[];
    options?: Options;
  }) => Promise<void>;
  postHook?: (opts: {
    command: string;
    args?: string[];
    options?: Options;
    pty;
  }) => Promise<void>;
}) {
  const subject = getSubject({ project_id, compute_server_id });
  const server: ConatSocketServer = client.socket.listen(subject, {
    keepAlive: 5000,
    keepAliveTimeout: 5000,
  });
  logger.debug("server: listening on ", { subject });

  const sessions: { [id: string]: any } = {};
  const history: { [id: string]: string } = {};
  const sizes: { [id: string]: { rows: number; cols: number }[] } = {};

  server.on("connection", (socket: ServerSocket) => {
    logger.debug("server: got new connection", {
      id: socket.id,
      subject: socket.subject,
    });

    let sessionId: string | null = null;
    let pty: any = null;
    let wpty: Writable | null = null;
    let buffer: string[] = [];
    const setPty = (p) => {
      pty = p;
      wpty = p == null ? null : createPtyWritable(p);
      buffer.length = 0;
    };
    socket.on("data", (data) => {
      buffer.push(data);
      processBuffer();
    });

    const processBuffer = reuseInFlight(async () => {
      while (buffer.length > 0 && wpty != null) {
        try {
          const data = buffer.shift()!;
          await writeToWritablePty(wpty, data);
        } catch (err) {
          logger.debug("server: writeToWritablePty", err);
          return;
        }
        await delay(1);
      }
    });

    const sendToClient = (data) => {
      try {
        socket.write(data);
      } catch (err) {
        if (err.code != "EPIPE") {
          // epipe means socket is closed...
          logger.debug("WARNING: error writing terminal data to socket", err);
        }
      }
    };

    const getClientSize = async () => {
      if (!sessionId) {
        return;
      }
      try {
        const { data } = await socket.request({ cmd: "size" });
        if (data) {
          sizes[sessionId] ??= [];
          sizes[sessionId].push(data);
        }
      } catch {}
    };

    const broadcast = async (event, payload?) => {
      try {
        await socket.request({ cmd: "broadcast", event, payload });
      } catch {}
    };

    const removeListeners = () => {
      if (pty == null) return;
      pty.removeListener("data", sendToClient);
      pty.removeListener("get-size", getClientSize);
      pty.removeListener("broadcast", broadcast);
      pty.emit("broadcast", "leave");
    };

    socket.on("closed", removeListeners);

    const handleRequest = async ({ data }) => {
      const { cmd } = data;
      switch (cmd) {
        case "destroy":
          pty?.destroy();
          if (sessionId) {
            delete sessions[sessionId];
            sessionId = null;
          }
          setPty(null);
          return;

        case "env":
          return process.env;

        case "cwd":
          const pid = pty?.pid;
          return pid ? cwd?.(pid) : undefined;

        case "broadcast":
          pty.emit("broadcast", data.event, data.payload);
          return;

        case "sizes":
          if (pty == null || !sessionId) {
            return [];
          }
          sizes[sessionId] = [];
          pty.emit("get-size");
          await delay(data.wait ?? DEFAULT_SIZE_WAIT);
          return sizes[sessionId];

        case "resize":
          const { rows, cols } = data;
          if (pty != null) {
            pty.resize(cols, rows);
            pty.emit("broadcast", "resize", { rows, cols });
          }
          return;

        case "history":
          return history[sessionId ?? ""];

        case "spawn":
          removeListeners();
          let { command, args, options = {} } = data;
          const { id } = options ?? {};
          if (id) {
            sessionId = id;
          }
          if (id && sessions[id] != null) {
            setPty(sessions[id]);
          } else {
            if (preHook != null) {
              const opts = { command, args, options };
              await preHook(opts);
              ({ command, args, options } = opts);
            }
            if (options.env0 != null) {
              options.env = {
                ...(options.env ?? process.env),
                ...options.env0,
              };
            }
            setPty(spawn(command, args, options));
            if (id) {
              sessions[id] = pty;
              history[id] = "";
              const maxLen = options?.maxHistoryLength ?? MAX_HISTORY_LENGTH;
              pty.on("data", (data) => {
                history[id] += data;
                if (history[id].length > maxLen + 1000) {
                  history[id] = history[id].slice(-maxLen);
                }
              });
            }
            await postHook?.({ command, args, options, pty });
          }

          const throttle = new ThrottleString(MAX_MSGS_PER_SECOND);
          throttle.on("data", sendToClient);
          pty.on("data", throttle.write);

          pty.once("exit", async () => {
            setPty(null);
            if (sessionId) {
              delete sessions[sessionId];
              sessionId = null;
            }
            try {
              await socket.request({ cmd: "exit" });
            } catch {}
          });

          pty.on("get-size", getClientSize);
          pty.on("broadcast", broadcast);

          return { pid: pty.pid, history: history[id ?? ""] };

        default:
          throw Error(`unknown command '${cmd}'`);
      }
    };

    socket.on("request", async (mesg) => {
      try {
        const resp = await handleRequest(mesg);
        mesg.respondSync(resp ?? null);
      } catch (err) {
        logger.debug(err);
        mesg.respondSync(err);
      }
    });

    socket.on("closed", () => {
      logger.debug("socket closed", { id: socket.id });
    });
  });

  return server;
}

export class TerminalClient extends EventEmitter {
  public readonly socket;
  public pid: number;
  private getSize?: () => undefined | { rows: number; cols: number };

  constructor({
    client,
    subject,
    getSize,
  }: {
    client: ConatClient;
    subject: string;
    getSize?: () => undefined | { rows: number; cols: number };
  }) {
    super();
    this.getSize = getSize;
    this.socket = client.socket.connect(subject);

    const handleRequest = ({ data }) => {
      switch (data.cmd) {
        case "size":
          return this.getSize?.();
        case "broadcast":
          this.emit(data.event, data.payload);
          return;
        case "exit":
          this.emit("exit");
          return;
        default:
          throw new Error(`unknown message type '${data.type}'`);
      }
    };

    this.socket.on("request", (mesg) => {
      try {
        const resp = handleRequest(mesg);
        mesg.respondSync(resp ?? null);
      } catch (err) {
        console.warn(err);
        mesg.respondSync(err);
      }
    });
  }

  close = () => {
    this.removeAllListeners();
    try {
      this.socket.close();
    } catch {}
  };

  spawn = async (
    command,
    args?: string[],
    options?: Options,
  ): Promise<string | undefined> => {
    const { data } = await this.socket.request({
      cmd: "spawn",
      command,
      args,
      options,
    });
    // console.log("spawned terminal with pid", data.pid);
    this.pid = data.pid;
    return data.history;
  };

  destroy = async () => {
    await this.socket.request({ cmd: "destroy" });
  };

  history = async () => {
    return (await this.socket.request({ cmd: "history" })).data;
  };

  env = async () => {
    return (await this.socket.request({ cmd: "env" })).data;
  };

  cwd = async () => {
    return (await this.socket.request({ cmd: "cwd" })).data;
  };

  resize = async ({ rows, cols }: { rows: number; cols: number }) => {
    await this.socket.request({ cmd: "resize", rows, cols });
  };

  sizes = async (wait?: number) => {
    return (await this.socket.request({ cmd: "sizes", wait })).data;
  };

  broadcast = async (event:string, payload?) => {
    await this.socket.request({ cmd: "broadcast", event, payload });
  };
}

export function terminalClient(opts: {
  project_id: string;
  compute_server_id?: number;
  client: ConatClient;
  getSize?: () => undefined | { rows: number; cols: number };
}): TerminalClient {
  return new TerminalClient({ ...opts, subject: getSubject(opts) });
}
