/*

DEVELOPMENT:


1. Stop files:read service running in the project by running this in your browser:

   await cc.client.conat_client.projectApi(cc.current()).system.terminate({service:'files:read'})

    {status: 'terminated', service: 'files:read'}

You can also skip step 1 if you instead set COMPUTE_SERVER_ID to something nonzero...

2. Setup the project environment variables. Then start the server in node:


    ~/cocalc/src/packages/project/conat$ . project-env.sh
    $ node
    Welcome to Node.js v18.17.1.
    Type ".help" for more information.

    require('@cocalc/project/conat/files/read').init()


*/

import "@cocalc/project/conat/env"; // ensure conat env available

import { createReadStream as fs_createReadStream } from "fs";
import { join } from "path";
import {
  createServer,
  close as closeReadServer,
} from "@cocalc/conat/files/read";
import { getIdentity } from "../connection";

function createReadStream(path: string) {
  if (path[0] != "/" && process.env.HOME) {
    path = join(process.env.HOME, path);
  }
  return fs_createReadStream(path);
}

// the project should call this on startup:
export async function init(opts?) {
  await createServer({ ...getIdentity(opts), createReadStream });
}

export async function close(opts?) {
  await closeReadServer(getIdentity(opts));
}
