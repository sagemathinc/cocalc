/*

DEVELOPMENT:


1. Stop files:read service running in the project by running this in your browser:

   await cc.client.nats_client.projectApi(cc.current()).system.terminate({service:'files:read'})

    {status: 'terminated', service: 'files:read'}

You can also skip step 1 if you instead set COMPUTE_SERVER_ID to something nonzero...

2. Setup the project environment variables. Then start the server in node:


    ~/cocalc/src/packages/project/nats$ . project-env.sh
    $ node
    Welcome to Node.js v18.17.1.
    Type ".help" for more information.

    require('@cocalc/project/nats/files/read').init()


*/

import "@cocalc/project/nats/env"; // ensure nats env available

import { createReadStream as fs_createReadStream } from "fs";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { join } from "path";
import {
  createServer,
  close as closeReadServer,
} from "@cocalc/conat/files/read";

function createReadStream(path: string) {
  if (path[0] != "/" && process.env.HOME) {
    path = join(process.env.HOME, path);
  }
  return fs_createReadStream(path);
}

// the project should call this on startup:
export async function init() {
  await createServer({ project_id, compute_server_id, createReadStream });
}

export async function close() {
  await closeReadServer({ project_id, compute_server_id });
}
