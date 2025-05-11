export { pstream } from "@cocalc/nats/persist/storage";

import "./index";
import betterSqlite3 from "better-sqlite3";
import { setDatabase } from "@cocalc/nats/persist/sqlite";
import { compress, decompress } from "zstd-napi";

setDatabase({ betterSqlite3, compress, decompress });
