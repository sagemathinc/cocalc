import "./index";
import Database from "better-sqlite3";
import { setDatabase } from "@cocalc/nats/persist/sqlite";
export { pstream } from "@cocalc/nats/persist/stream";

setDatabase(Database);
