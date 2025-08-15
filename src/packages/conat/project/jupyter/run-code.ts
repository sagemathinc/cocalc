/*
A conat socket server that takes as input

Tests are in

packages/backend/conat/test/juypter/run-code.test.s

*/

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import {
  type ConatSocketServer,
  type ServerSocket,
} from "@cocalc/conat/socket";
import { EventIterator } from "@cocalc/util/event-iterator";
import { getLogger } from "@cocalc/conat/client";
import { Throttle } from "@cocalc/util/throttle";
const MAX_MSGS_PER_SECOND = parseInt(
  process.env.COCALC_JUPYTER_MAX_MSGS_PER_SECOND ?? "20",
);
const logger = getLogger("conat:project:jupyter:run-code");

function getSubject({
  project_id,
  compute_server_id = 0,
}: {
  project_id: string;
  compute_server_id?: number;
}) {
  return `jupyter.project-${project_id}.${compute_server_id}`;
}

export interface InputCell {
  id: string;
  input: string;
  output?: { [n: string]: OutputMessage | null } | null;
  state?: "done" | "busy" | "run";
  exec_count?: number | null;
  start?: number | null;
  end?: number | null;
  cell_type?: "code";
}

export interface OutputMessage {
  // id = id of the cell
  id: string;
  // everything below is exactly from Jupyter
  metadata?;
  content?;
  buffers?;
  msg_type?: string;
  done?: boolean;
}

export interface RunOptions {
  // syncdb path
  path: string;
  // array of input cells to run
  cells: InputCell[];
  // if true do not halt running the cells, even if one fails with an error
  noHalt?: boolean;
  // the socket is used for raw_input, to communicate between the client
  // that initiated the request and the server.
  socket: ServerSocket;
}

type JupyterCodeRunner = (
  opts: RunOptions,
) => Promise<AsyncGenerator<OutputMessage, void, unknown>>;

interface OutputHandler {
  process: (mesg: OutputMessage) => void;
  done: () => void;
}

type CreateOutputHandler = (opts: {
  path: string;
  cells: InputCell[];
}) => OutputHandler;

export function jupyterServer({
  client,
  project_id,
  compute_server_id = 0,
  // run takes a path and cells to run and returns an async iterator
  // over the outputs.
  run,
  // outputHandler takes a path and returns an OutputHandler, which can be
  // used to process the output and include it in the notebook.  It is used
  // as a fallback in case the client that initiated running cells is
  // disconnected, so output won't be lost.
  outputHandler,
}: {
  client: ConatClient;
  project_id: string;
  compute_server_id?: number;
  run: JupyterCodeRunner;
  outputHandler?: CreateOutputHandler;
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
      const { path, cells, noHalt } = mesg.data;
      try {
        mesg.respondSync(null);
        await handleRequest({
          socket,
          run,
          outputHandler,
          path,
          cells,
          noHalt,
        });
      } catch (err) {
        logger.debug("server: failed to handle execute request -- ", err);
        if (socket.state != "closed") {
          try {
            logger.debug("sending to client: ", {
              headers: { error: `${err}` },
            });
            socket.write(null, { headers: { foo: "bar", error: `${err}` } });
          } catch (err) {
            // an error trying to report an error shouldn't crash everything
            logger.debug("WARNING: unable to send error to client", err);
          }
        }
      }
    });

    socket.on("closed", () => {
      logger.debug("socket closed", { id: socket.id });
    });
  });

  return server;
}

async function handleRequest({
  socket,
  run,
  outputHandler,
  path,
  cells,
  noHalt,
}) {
  const runner = await run({ path, cells, noHalt, socket });
  const output: OutputMessage[] = [];

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
    let handler: OutputHandler | null = null;
    for await (const mesg of runner) {
      if (socket.state == "closed") {
        // client socket has closed -- the backend server must take over!
        if (handler == null) {
          logger.debug("socket closed -- server must handle output");
          if (outputHandler == null) {
            throw Error("no output handler available");
          }
          handler = outputHandler({ path, cells });
          if (handler == null) {
            throw Error("bug -- outputHandler must return a handler");
          }
          for (const prev of output) {
            handler.process(prev);
          }
          output.length = 0;
        }
        handler.process(mesg);
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
    handler?.done();
    if (socket.state != "closed") {
      throttle.flush();
      socket.write(null);
    }
  } finally {
    throttle.close();
  }
}

export class JupyterClient {
  private iter?: EventIterator<OutputMessage[]>;
  public readonly socket;
  constructor(
    private client: ConatClient,
    private subject: string,
    private path: string,
    private stdin: (opts: {
      id: string;
      prompt: string;
      password?: boolean;
    }) => Promise<string>,
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
    this.iter?.end();
    delete this.iter;
    this.socket.close();
  };

  run = async (cells: InputCell[], opts: { noHalt?: boolean } = {}) => {
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
      path: this.path,
      cells: cells1,
      noHalt: opts.noHalt,
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
