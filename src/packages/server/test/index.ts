/*
Setup an ephemeral environment in process for running tests.  This includes a conat socket.io server,
file server, etc.

TODO: it would be nice to use pglite as an *option* here so there is no need to run a separate database
server.  We still need full postgres though, so we can test the ancient versions we use in production,
since pglite is only very recent postgres.
*/

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import {
  before as conatTestInit,
  after as conatTestClose,
} from "@cocalc/backend/conat/test/setup";
import { localPathFileserver } from "@cocalc/backend/conat/files/local-path";
import { init as initFileserver } from "@cocalc/server/conat/file-server";
import {
  before as fileserverTestInit,
  after as fileserverTestClose,
} from "@cocalc/file-server/btrfs/test/setup";

export { getPool, initEphemeralDatabase };

export async function before() {
  await initEphemeralDatabase();

  // run a conat socketio server
  await conatTestInit();

  // run server that can provides an enchanced fs module for files on the local filesystem
  await localPathFileserver();

  const ephemeralFilesystem = await fileserverTestInit();
  // server that provides a btrfs managed filesystem
  await initFileserver(ephemeralFilesystem);
}

export async function after() {
  await getPool().end();
  await fileserverTestClose();
  await conatTestClose();
}
