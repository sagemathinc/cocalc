import getConnection, { connectToConat } from "./connection";
import { project_id } from "@cocalc/project/data";
import {
  createSyncTable,
  type ConatSyncTable,
} from "@cocalc/conat/sync/synctable";
import { parse_query } from "@cocalc/sync/table/util";
import { keys } from "lodash";
import type { ConatSyncTableFunction } from "@cocalc/conat/sync/synctable";

const jc = null as any;

const synctable: ConatSyncTableFunction = async (
  query,
  options?,
): Promise<ConatSyncTable> => {
  const nc = await getConnection();
  const cn = await connectToConat();
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
    env: { jc, nc, cn },
  });
  await s.init();
  return s;
};

export default synctable;
