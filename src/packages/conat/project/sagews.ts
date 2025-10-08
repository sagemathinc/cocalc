// This is basically a simple version of jupyter/run-code.ts

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import {
  type ConatSocketServer,
  type ServerSocket,
} from "@cocalc/conat/socket";
import { EventIterator } from "@cocalc/util/event-iterator";
import { getLogger } from "@cocalc/conat/client";
import { Throttle } from "@cocalc/util/throttle";
import { MAX_MSGS_PER_SECOND } from "./jupyter/run-code";

const logger = getLogger("conat:project:sagews");

function getSubject({
  project_id,
  compute_server_id = 0,
}: {
  project_id: string;
  compute_server_id?: number;
}) {
  return `sagews.project-${project_id}.${compute_server_id}`;
}

export interface OutputMessage {
  id: string;
}

export interface RunOptions {
  // path to sagews file
  path: string;
  input: string;
}

// a function that takes a path and code to run
// and returns an async iterator over the outputs.
type SagewsCodeRunner = (
  opts: RunOptions,
) => Promise<AsyncGenerator<OutputMessage, void, unknown>>;

export function sagewsServer({
  client,
  project_id,
  compute_server_id = 0,
  run,
  getState,
}: {
  client: ConatClient;
  project_id: string;
  compute_server_id?: number;
  run: SagewsCodeRunner;
  getState: (opts: { path: string }) => Promise<string>;
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

    socket.on("request", async (mesg) => {
      const { data } = mesg;
      const { cmd, path } = data;
      if (cmd == "get-state") {
        mesg.respondSync(await getState({ path }));
      } else if (cmd == "run") {
        const { input } = data;
        try {
          mesg.respondSync(null);
          await handleRequest({
            socket,
            run,
            path,
            input,
          });
        } catch (err) {
          logger.debug("server: failed to handle execute request -- ", err);
          if (socket.state != "closed") {
            try {
              logger.debug("sending to client: ", {
                headers: { error: `${err}` },
              });
              socket.write(null, { headers: { error: `${err}` } });
            } catch (err) {
              // an error trying to report an error shouldn't crash everything
              logger.debug("WARNING: unable to send error to client", err);
            }
          }
        }
      } else {
        const error = `Unknown command '${cmd}'`;
        logger.debug(error);
        mesg.respondSync(null, { headers: { error } });
      }
    });

    socket.on("closed", () => {
      logger.debug("socket closed", { id: socket.id });
    });
  });

  return server;
}

async function handleRequest({ socket, run, path, input }) {
  const runner = await run({ path, input });
  const output: OutputMessage[] = [];
  logger.debug(
    `handleRequest to evaluate input of length ${input.length} path=${path}`,
  );

  const throttle = new Throttle<OutputMessage>(MAX_MSGS_PER_SECOND);
  let unhandledClientWriteError: any = undefined;
  throttle.on("data", async (mesgs) => {
    try {
      socket.write(mesgs);
    } catch (err) {
      if (err.code == "ENOBUFS") {
        // wait for the over-filled socket to finish writing out data.
        await socket.drain();
        socket.write(mesgs);
      } else {
        unhandledClientWriteError = err;
      }
    }
  });

  try {
    for await (const mesg of runner) {
      if (socket.state == "closed") {
        // client socket has closed -- give up; for sagews we do NOT handle long
        // running code with browser refresh anymore; if you need that, use Jupyter
        // or write to a file.
        return;
      } else {
        if (unhandledClientWriteError) {
          throw unhandledClientWriteError;
        }
        output.push(mesg);
        throttle.write(mesg);
      }
    }
    // no errors happened, so close up and flush and
    // remaining data immediately:
    if (socket.state != "closed") {
      throttle.flush();
      socket.write(null);
    }
  } finally {
    throttle.close();
  }
}

export class SagewsClient {
  private iter?: EventIterator<OutputMessage[]>;
  public readonly socket;
  constructor(
    private client: ConatClient,
    private subject: string,
    private path: string,
  ) {
    this.socket = this.client.socket.connect(this.subject);
    this.socket.once("close", () => this.iter?.end());
    this.socket.on("request", async (mesg) => {
      const { data } = mesg;
      try {
        switch (data.type) {
          case "stdin":
            await mesg.respond(await this.stdin(data));
            return;
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
      this.iter?.end();
      delete this.iter;
      this.socket.close();
    } catch {}
  };

  moreOutput = async (id: string) => {
    const { data } = await this.socket.request({
      cmd: "more",
      path: this.path,
      id,
    });
    return data;
  };

  getKernelStatus = async () => {
    const { data } = await this.socket.request({
      cmd: "get-kernel-status",
      path: this.path,
    });
    return data;
  };

  run = async (
    cells: InputCell[],
    opts: { noHalt?: boolean; limit?: number } = {},
  ) => {
    if (this.iter) {
      // one evaluation at a time -- starting a new one ends the previous one.
      // Each client browser has a separate instance of JupyterClient, so
      // a properly implemented frontend client would never hit this.
      this.iter.end();
      delete this.iter;
    }
    this.iter = new EventIterator<OutputMessage[]>(this.socket, "data", {
      map: (args) => {
        if (args[1]?.error) {
          this.iter?.throw(Error(args[1].error));
          return;
        }
        if (args[0] == null) {
          this.iter?.end();
          return;
        } else {
          return args[0];
        }
      },
    });
    // get rid of any fields except id and input from the cells, since, e.g.,
    // if there is a lot of output in a cell, there is no need to send that to the backend.
    const cells1 = cells.map(({ id, input }) => {
      return { id, input };
    });
    await this.socket.request({
      cmd: "run",
      ...opts,
      path: this.path,
      cells: cells1,
    });
    return this.iter;
  };
}

export function jupyterClient(opts: {
  path: string;
  project_id: string;
  compute_server_id?: number;
  client: ConatClient;
  stdin?: (opts: {
    id: string;
    prompt: string;
    password?: boolean;
  }) => Promise<string>;
}): JupyterClient {
  const subject = getSubject(opts);
  return new JupyterClient(
    opts.client,
    subject,
    opts.path,
    opts.stdin ?? (async () => "stdin not implemented"),
  );
}
