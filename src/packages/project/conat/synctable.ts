import { connectToConat } from "./connection";
import { project_id } from "@cocalc/project/data";
import { type ConatSyncTable, type ConatSyncTableFunction } from "@cocalc/conat/sync/synctable";
import { parse_query } from "@cocalc/sync/table/util";
import { keys } from "lodash";

const synctable: ConatSyncTableFunction = async (
  query,
  options?,
): Promise<ConatSyncTable> => {
  query = parse_query(query);
  const table = keys(query)[0];
  const obj = options?.obj;
  if (obj != null) {
    for (const k in obj) {
      query[table][0][k] = obj[k];
    }
  }
  const client = await connectToConat();
  query[table][0].project_id = project_id;
  return await client.sync.synctable({
    project_id,
    ...options,
    query,
  });
};

export default synctable;
