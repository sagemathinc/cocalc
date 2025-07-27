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

type OutputMessage = any;

type JupyterCodeRunner = (opts: {
  // syncdb path
  path: string;
  // array of input cells to run
  cells: InputCell[];
}) => Promise<AsyncGenerator<OutputMessage[], void, unknown>>;

export function jupyterServer({
  client,
  project_id,
  compute_server_id = 0,
  jupyterRun,
}: {
  client: ConatClient;
  project_id: string;
  compute_server_id?: number;
  jupyterRun: JupyterCodeRunner;
}) {
  const subject = getSubject({ project_id, compute_server_id });
  const server: ConatSocketServer = client.socket.listen(subject);
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
        await handleRequest({ socket, jupyterRun, path, cells });
      } catch (err) {
        console.log(err);
        logger.debug("server: failed response -- ", err);
      }
    });
  });

  return server;
}

async function handleRequest({ socket, jupyterRun, path, cells }) {
  const runner = await jupyterRun({ path, cells });
  for await (const result of runner) {
    socket.write(result);
  }
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
        if (args[0] == null) {
          this.iter?.end();
          return null;
        } else {
          return args[0];
        }
      },
    });
    await this.socket.request({ path: this.path, cells });
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
