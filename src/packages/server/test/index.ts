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
  connect,
  client,
  wait,
} from "@cocalc/backend/conat/test/setup";

export { client, connect, getPool, initEphemeralDatabase, wait };

let opts: any = {};
export async function before({
  noConat,
  noFileserver: _,
  noDatabase,
}: { noConat?: boolean; noFileserver?: boolean; noDatabase?: boolean } = {}) {
  opts = {
    noConat,
    noDatabase,
  };
  if (!noDatabase) {
    await initEphemeralDatabase();
  }

  if (!noConat) {
    // run a conat socketio server
    await conatTestInit();
  }
}

export async function after() {
  const { noConat, noDatabase } = opts;
  if (!noDatabase && process.env.COCALC_DB !== "pglite") {
    await getPool().end();
  }

  if (!noConat) {
    await conatTestClose();
  }
}
