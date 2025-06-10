import { connectToConat } from "./connection";
import { project_id } from "@cocalc/project/data";
import {
  type ConatSyncTable,
  type ConatSyncTableFunction,
} from "@cocalc/conat/sync/synctable";
import { parseQueryWithOptions } from "@cocalc/sync/table/util";

const synctable: ConatSyncTableFunction = async (
  query0,
  options?,
): Promise<ConatSyncTable> => {
  const { query, table } = parseQueryWithOptions(query0, options);
  const client = await connectToConat();
  query[table][0].project_id = project_id;
  return await client.sync.synctable({
    project_id,
    ...options,
    query,
  });
};

export default synctable;
