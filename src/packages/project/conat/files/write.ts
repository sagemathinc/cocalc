/*

DEVELOPMENT:


1. Stop the files:write service running in the project by running this in your browser:

   await cc.client.conat_client.projectApi(cc.current()).system.terminate({service:'files:write'})

    {status: 'terminated', service: 'files:write'}

You can also skip step 1 if you instead set COMPUTE_SERVER_ID to something nonzero...

2. Setup the project environment variables. Then start the server in node:


    ~/cocalc/src/packages/project/conat$ . project-env.sh
    $ node
    Welcome to Node.js v18.17.1.
    Type ".help" for more information.

    require('@cocalc/project/conat/files/write').init()


*/

import "@cocalc/project/conat/env"; // ensure conat env available
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { createWriteStream as fs_createWriteStream } from "fs";
import { rename } from "fs/promises";
import { join } from "path";
import {
  createServer,
  close as closeWriteServer,
} from "@cocalc/conat/files/write";
import { randomId } from "@cocalc/conat/names";
import { rimraf } from "rimraf";
import { getIdentity } from "../connection";

async function createWriteStream(path: string) {
  // console.log("createWriteStream", { path });
  if (path[0] != "/" && process.env.HOME) {
    path = join(process.env.HOME, path);
  }
  await ensureContainingDirectoryExists(path);
  const partial = path + `.partialupload-${randomId()}`;
  const stream = fs_createWriteStream(partial);
  stream.on("remove", async () => {
    await rimraf(partial);
  });
  stream.on("rename", async () => {
    await rename(partial, path);
  });

  // TODO: path should be a temporary path to indicate that it is a partial
  // upload, then get moved to path when done or deleted on error.
  return stream;
}

// the project should call this on startup:
export async function init(opts?) {
  await createServer({ ...getIdentity(opts), createWriteStream });
}

export async function close(opts?) {
  await closeWriteServer(getIdentity(opts));
}
