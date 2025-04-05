import getConnection from "./connection";
import { project_id } from "@cocalc/project/data";
import { JSONCodec } from "nats";
import {
  createSyncTable,
  type NatsSyncTable,
} from "@cocalc/nats/sync/synctable";
import { parse_query } from "@cocalc/sync/table/util";
import { keys } from "lodash";
import type { NatsSyncTableFunction } from "@cocalc/nats/sync/synctable";

const jc = JSONCodec();

const synctable: NatsSyncTableFunction = async (
  query,
  options?,
): Promise<NatsSyncTable> => {
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
  const s = createSyncTable({
    project_id,
    ...options,
    query,
    env: { jc, nc },
  });
  await s.init();
  return s;
};

export default synctable;
