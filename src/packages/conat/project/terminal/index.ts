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

type State = "running" | "off";

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

  // ms until throw error if backend doesn't respond
  timeout?: number;
}

const sessions: { [id: string]: any } = {};
const history: { [id: string]: string } = {};
const sizes: { [id: string]: { rows: number; cols: number }[] } = {};

type TerminalMessageKind = "user" | "auto";

interface TerminalIncomingMessage {
  data: string;
  kind: TerminalMessageKind;
}

interface PendingMessage {
  message: TerminalIncomingMessage;
  socket: ServerSocket;
}

const sessionMembers: Record<string, Set<string>> = {};
const sessionLeaders: Record<string, string> = {};
const sessionLeaderActivity: Record<string, number> = {};

const sessionKey = (subject: string, sessionId: string) =>
  `${subject}::${sessionId}`;

const LEADER_INACTIVITY_MS = parseInt(
  process.env.COCALC_TERMINAL_LEADER_TIMEOUT_MS ?? "10000",
);

function setLeader(subject: string, sessionId: string, socketId: string) {
  const key = sessionKey(subject, sessionId);
  sessionLeaders[key] = socketId;
  sessionLeaderActivity[key] = Date.now();
}

function addSessionMember(
  subject: string,
  sessionId: string,
  socketId: string,
) {
  const key = sessionKey(subject, sessionId);
  sessionMembers[key] ??= new Set();
  sessionMembers[key].add(socketId);
  if (!sessionLeaders[key]) {
    setLeader(subject, sessionId, socketId);
  }
}

function removeSessionMember(
  subject: string,
  sessionId: string,
  socketId: string,
) {
  const key = sessionKey(subject, sessionId);
  const members = sessionMembers[key];
  if (members == null) {
    return;
  }
  members.delete(socketId);
  if (members.size === 0) {
    delete sessionMembers[key];
    delete sessionLeaders[key];
    delete sessionLeaderActivity[key];
    return;
  }
  if (sessionLeaders[key] === socketId) {
    const next = members.values().next();
    if (next.done) {
      delete sessionLeaders[key];
      delete sessionLeaderActivity[key];
    } else {
      setLeader(subject, sessionId, next.value);
    }
  }
}

function isLeader(
  subject: string,
  sessionId: string | null,
  socketId: string,
): boolean {
  if (!sessionId) {
    return true;
  }
  const key = sessionKey(subject, sessionId);
  return sessionLeaders[key] === socketId;
}

function recordLeaderActivity(subject: string, sessionId: string | null) {
  if (!sessionId) return;
  const key = sessionKey(subject, sessionId);
  sessionLeaderActivity[key] = Date.now();
}

function maybePromoteLeader(
  subject: string,
  sessionId: string | null,
  socketId: string,
): boolean {
  if (!sessionId) {
    return false;
  }
  const key = sessionKey(subject, sessionId);
  const last = sessionLeaderActivity[key] ?? 0;
  if (sessionLeaders[key] && Date.now() - last < LEADER_INACTIVITY_MS) {
    return false;
  }
  if (!sessionLeaders[key] || sessionLeaders[key] !== socketId) {
    setLeader(subject, sessionId, socketId);
    return true;
  }
  return false;
}

function normalizeIncoming(data: any): TerminalIncomingMessage | null {
  if (data == null) {
    return null;
  }
  if (typeof data === "string") {
    return { data, kind: "user" };
  }
  if (Buffer.isBuffer(data)) {
    return { data: data.toString("utf8"), kind: "user" };
  }
  if (typeof data === "object") {
    if (Array.isArray(data)) {
      return normalizeIncoming(data.join(""));
    }
    const payload = data as Record<string, any>;
    if (typeof payload.data === "string") {
      const kind: TerminalMessageKind =
        payload.kind === "auto" ? "auto" : "user";
      return { data: payload.data, kind };
    }
  }
  return null;
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

  server.on("connection", (socket: ServerSocket) => {
    logger.debug("server: got new connection", {
      id: socket.id,
      subject: socket.subject,
    });

    let sessionId: string | null = null;
    const updateSessionId = (nextId: string | null) => {
      if (sessionId === nextId) {
        return;
      }
      if (sessionId) {
        removeSessionMember(subject, sessionId, socket.id);
      }
      sessionId = nextId;
      if (sessionId) {
        addSessionMember(subject, sessionId, socket.id);
      }
    };
    let pty: any = null;
    let wpty: Writable | null = null;
    const buffer: PendingMessage[] = [];
    const setPty = (p) => {
      pty = p;
      wpty = p == null ? null : createPtyWritable(p);
      buffer.length = 0;
    };
    socket.on("data", (data) => {
      const message = normalizeIncoming(data);
      if (message == null) {
        return;
      }
      buffer.push({ message, socket });
      processBuffer();
    });

    const processBuffer = reuseInFlight(async () => {
      while (buffer.length > 0 && wpty != null) {
        const entry = buffer.shift();
        if (entry == null) {
          break;
        }
        const { message, socket: origin } = entry;
        if (!message.data) {
          continue;
        }
        if (sessionId) {
          if (isLeader(subject, sessionId, origin.id)) {
            recordLeaderActivity(subject, sessionId);
          } else if (
            message.kind === "auto" &&
            maybePromoteLeader(subject, sessionId, origin.id)
          ) {
            logger.debug(
              "terminal: promoting socket to leader due to inactivity",
              {
                subject,
                sessionId,
                newLeader: origin.id,
              },
            );
          }
        }
        if (
          message.kind === "auto" &&
          !isLeader(subject, sessionId, origin.id)
        ) {
          continue;
        }
        try {
          await writeToWritablePty(wpty, message.data);
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
          }
          updateSessionId(null);
          setPty(null);
          return;

        case "env":
          return process.env;

        case "cwd":
          const pid = pty?.pid;
          return pid ? cwd?.(pid) : undefined;

        case "state":
          return (pty?.pid ? "running" : "off") as State;

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
          updateSessionId(id ?? null);
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
            }
            updateSessionId(null);
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
      updateSessionId(null);
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
    const { data } = await this.socket.request(
      {
        cmd: "spawn",
        command,
        args,
        options,
      },
      { timeout: options?.timeout },
    );
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

  state = async (): Promise<State> => {
    return (await this.socket.request({ cmd: "state" })).data;
  };

  resize = async ({ rows, cols }: { rows: number; cols: number }) => {
    await this.socket.request({ cmd: "resize", rows, cols });
  };

  sizes = async (wait?: number) => {
    return (await this.socket.request({ cmd: "sizes", wait })).data;
  };

  broadcast = async (event: string, payload?) => {
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
