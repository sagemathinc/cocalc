import getConnection from "./connection";
import { project_id } from "@cocalc/project/data";
import { JSONCodec } from "nats";
import { sha1 } from "@cocalc/backend/sha1";
import { SyncTableKV } from "@cocalc/util/nats/synctable-kv";
import { SyncTableStream } from "@cocalc/util/nats/synctable-stream";
import { parse_query } from "@cocalc/sync/table/util";
import { keys } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const jc = JSONCodec();

const cache: { [key: string]: SyncTableKV | SyncTableStream } = {};
const synctable = reuseInFlight(async (query, obj?) => {
  const key = JSON.stringify(query);
  if (cache[key] == null) {
    const nc = await getConnection();
    query = parse_query(query);
    const table = keys(query)[0];
    if (obj != null) {
      for (const k in obj) {
        query[table][0][k] = obj[k];
      }
    }
    query[table][0].project_id = project_id;
    const SyncTable = getClass(table);
    const s = new SyncTable({ query, env: { sha1, jc, nc } });
    await s.init();
    cache[key] = s;
  }
  return cache[key];
});

export default synctable;

function getClass(table) {
  if (table == "patches") {
    return SyncTableStream;
  }
  return SyncTableKV;
}
