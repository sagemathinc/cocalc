/*
- it connects to the project and registers as a compute-server (sending its id number).
- it receives messages from project
- one of the messages is "connect to this path", where the path ends in .term or .ipynb
- it handles that by launching the command to create the connection.
- by default it just launches it in the same process, but it can configured to instead create a docker container to handle the connection
- another message is "disconnect from this path".  That closes the connection or stops the docker container.
- compute server
*/

import { project } from "@cocalc/api-client";
import SyncClient from "@cocalc/sync-client";
import getLogger from "@cocalc/backend/logger";
import { COMPUTE_SERVER_CHANNEL_NAME } from "@cocalc/util/compute/manager";

const logger = getLogger("compute:manager");

interface Options {
  project_id: string;
  // the id number of this manager, should be the id in the database from the compute_servers table.
  compute_server_id: number;
}

// path should be something like "foo/.bar.term"
// This particular code for now is just about making one single frame
// use a remote terminal.  We will of course be building much more on this.
// This is basically the foundational proof of concept step.
export async function manager({ project_id, compute_server_id }: Options) {
  if (!project_id) {
    throw Error("project_id must be given");
  }
  if (!compute_server_id) {
    throw Error("compute_server_id must be given");
  }
  const m = new Manager({ project_id, compute_server_id });
  await m.init();
  return m;
}

class Manager {
  private project_id: string;
  private compute_server_id: number;
  private conn?;
  private channel?;
  private registered?;

  constructor({ project_id, compute_server_id }: Options) {
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
  }

  log = (func, ...args) => {
    logger.debug({ id: this.compute_server_id }, `Manager.${func}`, ...args);
  };

  init = async () => {
    const { project_id } = this;
    this.log("init", "ping project to wake it up:", project_id);
    await project.ping({ project_id });

    this.log("init", "Get a websocket connection to project ", project_id);
    const client = new SyncClient({ project_id });
    this.conn = await client.project_client.websocket(project_id);

    this.initChannel();
    this.conn.on("open", () => {
      console.log("connection open");
      this.initChannel();
    });
    this.conn.on("end", () => {
      console.log("connection ended");
      this.channel?.end();
      delete this.channel;
      delete this.registered;
    });
    this.conn.on("reconnect", () => {
      console.log("connection reconnecting");
      this.channel?.end();
      delete this.channel;
      delete this.registered;
    });
  };

  private initChannel = () => {
    this.log("initChannel", "creating channel", COMPUTE_SERVER_CHANNEL_NAME);
    this.channel = this.conn.channel(COMPUTE_SERVER_CHANNEL_NAME);
    this.channel.on("data", this.handleMessageFromProject);
    if (!this.registered) {
      this.register();
    }
  };

  private register = () => {
    if (this.channel == null) return;
    this.registered = register(this.compute_server_id);
    this.sendMessageToProject(this.registered);
  };

  private sendMessageToProject = (message) => {
    this.channel.write(message);
  };

  private handleMessageFromProject = (message) => {
    this.log("GOT ", message);
  };
}

function register(compute_server_id: number) {
  return { event: "register", compute_server_id };
}
