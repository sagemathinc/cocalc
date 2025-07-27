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

interface InputCell {
  id: string;
  input: string;
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
  // jupyterRun takes a path and cells to run and returns an async iterator
  // over the outputs.
  jupyterRun,
  // outputHandler takes a path and returns an OutputHandler, which can be
  // used to process the output and include it in the notebook.  It is used
  // as a fallback in case the client that initiated running cells is
  // disconnected, so output won't be lost.
  outputHandler,
}: {
  client: ConatClient;
  project_id: string;
  compute_server_id?: number;
  jupyterRun: JupyterCodeRunner;
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
      const { path, cells } = mesg.data;
      try {
        mesg.respondSync(null);
        await handleRequest({ socket, jupyterRun, outputHandler, path, cells });
      } catch (err) {
        //console.log(err);
        logger.debug("server: failed response -- ", err);
        if (socket.state != "closed") {
          socket.write(null, { headers: { error: `${err}` } });
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
  jupyterRun,
  outputHandler,
  path,
  cells,
}) {
  const runner = await jupyterRun({ path, cells });
  const output: OutputMessage[] = [];
  let handler: OutputHandler | null = null;
  for await (const mesg of runner) {
    if (socket.state == "closed") {
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
      output.push(mesg);
      socket.write([mesg]);
    }
  }
  handler?.done();
  socket.write(null);
}

class JupyterClient {
  private iter?: EventIterator<OutputMessage[]>;
  private socket;
  constructor(
    private client: ConatClient,
    private subject: string,
    private path: string,
  ) {
    this.socket = this.client.socket.connect(this.subject);
    this.socket.once("close", () => this.iter?.end());
  }

  close = () => {
    this.iter?.end();
    delete this.iter;
    this.socket.close();
  };

  run = async (cells: InputCell[]) => {
    if (this.iter) {
      // one evaluation at a time.
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
          return null;
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
    await this.socket.request({ path: this.path, cells: cells1 });
    return this.iter;
  };
}

export function jupyterClient(opts: {
  path: string;
  project_id: string;
  compute_server_id?: number;
  client: ConatClient;
}) {
  const subject = getSubject(opts);
  return new JupyterClient(opts.client, subject, opts.path);
}
