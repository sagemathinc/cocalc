import "./index";
import betterSqlite3 from "better-sqlite3";
import { setDatabase } from "@cocalc/nats/persist/sqlite";
import { compress, decompress } from "zstd-napi";
import { syncFiles } from "@cocalc/backend/data";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";

setDatabase({
  betterSqlite3,
  compress,
  decompress,
  syncFiles,
  ensureContainingDirectoryExists,
});

export { pstream } from "@cocalc/nats/persist/storage";
export {
  init as initServer,
  terminate as terminateServer,
} from "@cocalc/nats/persist/server";
export { getAll, set, get } from "@cocalc/nats/persist/client";
