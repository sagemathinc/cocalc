/*

To test having multiple persist servers at once in dev mode, start
up your dev server.  Then do the following in nodejs to create an
additional persist server:

   require("@cocalc/backend/conat/persist").initPersistServer()

*/

import "./index";
import betterSqlite3 from "better-sqlite3";
import { initContext } from "@cocalc/conat/persist/context";
import { compress, decompress } from "zstd-napi";
import { syncFiles } from "@cocalc/backend/data";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { statSync, copyFileSync } from "node:fs";

initContext({
  betterSqlite3,
  compress,
  decompress,
  syncFiles,
  ensureContainingDirectoryExists,
  statSync,
  copyFileSync,
});

export { pstream } from "@cocalc/conat/persist/storage";
import { server } from "@cocalc/conat/persist/server";
export { server };
import { conat } from "./conat";

const persistServers: any[] = [];

export function initPersistServer() {
  const persistServer = server({
    client: conat({ noCache: persistServers.length > 0 }),
  });
  persistServers.push(persistServer);
}

export function close() {
  for (const persistServer of persistServers) {
    persistServer.end(); // end is a bit more graceful
  }
  persistServers.length = 0;
}
