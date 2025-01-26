import getConnection from "./connection";
import { project_id } from "@cocalc/project/data";
import { JSONCodec } from "nats";
import { sha1 } from "@cocalc/backend/sha1";
import { createSyncTable, type SyncTable } from "@cocalc/nats/sync/synctable";
import { parse_query } from "@cocalc/sync/table/util";
import { keys } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const jc = JSONCodec();

const cache: { [key: string]: SyncTable } = {};
const synctable = reuseInFlight(
  async (query, options: { obj?; atomic?: boolean; stream?: boolean }) => {
    const key = JSON.stringify(query);
    if (cache[key] == null) {
      const nc = await getConnection();
      query = parse_query(query);
      const table = keys(query)[0];
      const obj = options?.obj;
      if (obj != null) {
        for (const k in obj) {
          query[table][0][k] = obj[k];
        }
      }
      query[table][0].project_id = project_id;
      const s = createSyncTable({ ...options, query, env: { sha1, jc, nc } });
      await s.init();
      cache[key] = s;
    }
    return cache[key];
  },
);

export default synctable;
