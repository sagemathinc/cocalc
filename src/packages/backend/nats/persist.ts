export { pstream } from "@cocalc/nats/persist/stream";

import "./index";
import betterSqlite3 from "better-sqlite3";
import { setDatabase } from "@cocalc/nats/persist/sqlite";
import * as lz4 from "lz4-napi";

setDatabase({ betterSqlite3, lz4 });
