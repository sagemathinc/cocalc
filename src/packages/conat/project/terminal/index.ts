/*
Terminal
*/

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import {
  type ConatSocketServer,
  type ServerSocket,
} from "@cocalc/conat/socket";
import { getLogger } from "@cocalc/conat/client";
import { Throttle } from "@cocalc/util/throttle";
const MAX_MSGS_PER_SECOND = parseInt(
  process.env.COCALC_TERMINAL_MAX_MSGS_PER_SECOND ?? "24",
);
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

export function terminalServer({
  client,
  project_id,
  compute_server_id = 0,
  spawn,
}: {
  client: ConatClient;
  project_id: string;
  compute_server_id?: number;
  spawn;
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

    let pty: any = null;
    socket.on("data", (data) => {
      pty?.write(data);
    });
    socket.on("request", async (mesg) => {
      const { data } = mesg;
      const { cmd } = data;
      try {
        switch (cmd) {
          case "spawn":
            pty = spawn(...data.args);
            mesg.respondSync({ pid: pty.pid });
            pty.on("data", (data) => {
              socket.write(data);
            });
            break;
          default:
            throw Error(`unknown command '${cmd}'`);
        }
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

export class TerminalClient {
  public readonly socket;
  constructor(
    private client: ConatClient,
    private subject: string,
  ) {
    this.socket = this.client.socket.connect(this.subject);
    this.socket.on("request", async (mesg) => {
      const { data } = mesg;
      try {
        switch (data.cmd) {
          default:
            console.warn(`Jupyter: got unknown message type '${data.type}'`);
            await mesg.respond(
              new Error(`unknown message type '${data.type}'`),
            );
        }
      } catch (err) {
        console.warn("error responding to jupyter request", err);
      }
    });
  }

  close = () => {
    try {
      this.socket.close();
    } catch {}
  };

  spawn = async (...args): Promise<{ pid: number }> => {
    const resp = await this.socket.request({ cmd: "spawn", args });
    return resp.data;
  };
}

export function terminalClient(opts: {
  project_id: string;
  compute_server_id?: number;
  client: ConatClient;
}): TerminalClient {
  const subject = getSubject(opts);
  return new TerminalClient(opts.client, subject);
}
