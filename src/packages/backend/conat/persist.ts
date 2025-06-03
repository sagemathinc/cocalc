import "./index";
import betterSqlite3 from "better-sqlite3";
import { initContext } from "@cocalc/conat/persist/context";
import { compress, decompress } from "zstd-napi";
import { syncFiles } from "@cocalc/backend/data";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";

initContext({
  betterSqlite3,
  compress,
  decompress,
  syncFiles,
  ensureContainingDirectoryExists,
});

export { pstream } from "@cocalc/conat/persist/storage";
import { server } from "@cocalc/conat/persist/server";
export { server };
import { conat } from "./conat";

let persistServer: any = undefined;

export function initPersistServer() {
  persistServer = server({ client: conat() });
}
export function close() {
  persistServer?.end(); // end is a bit more graceful
  persistServer = undefined;
}
