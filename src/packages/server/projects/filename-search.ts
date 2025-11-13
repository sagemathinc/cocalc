// Returns the most recent time the given user edited a file
// whose name contains the search string.

import getPool from "@cocalc/database/pool";
import { MAX_FILENAME_SEARCH_RESULTS } from "@cocalc/util/db-schema/projects";

export async function filenameSearch({
  search,
  account_id,
}: {
  search: string;
  account_id: string;
}): Promise<{ project_id: string; filename: string; time: Date }[]> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    `
  SELECT project_id, filename, time
FROM (
  SELECT project_id, filename, time,
    ROW_NUMBER() OVER(PARTITION BY filename ORDER BY time DESC) AS rn
  FROM file_access_log
  WHERE account_id = $1
    AND filename ILIKE '%' || $2 || '%'
) tmp
WHERE rn = 1
ORDER BY time DESC
LIMIT ${MAX_FILENAME_SEARCH_RESULTS};
`,
    [account_id, search],
  );
  return rows;
}
