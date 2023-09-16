/*
- it connects to the project and registers as a compute\-server \(sending its id number\).
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

  const log = logger.debug;

  log("ping project to wake it up:", project_id);
  await project.ping({ project_id });

  log("Get a websocket connection to project ", project_id);
  const client = new SyncClient({ project_id });
  const ws = await client.project_client.websocket(project_id);

  log("opening channel", COMPUTE_SERVER_CHANNEL_NAME);
  const channel = ws.channel(COMPUTE_SERVER_CHANNEL_NAME);
  channel.on("data", (data) => {
    console.log("GOT ", data);
  });
  return channel;
  //channel.on("")
}
