/*
Returns array of such projects, with the following fields:

- project_id
- title
- map from license_id to what is being used right now
- last_edited
- if project is hidden
- project state, e.g., 'running'
*/

import getPool from "@cocalc/database/pool";
import { toEpoch } from "@cocalc/database/postgres/utils/to-epoch";
import { isValidUUID } from "@cocalc/util/misc";
import { State } from "@cocalc/util/compute-states";

export interface Project {
  project_id: string;
  title: string;
  site_license: object;
  hidden?: boolean;
  last_edited: number; // ms since epoch
  state?: State;
}

export default async function getProjects(
  account_id: string,
): Promise<Project[]> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid account_id -- must be a uuid");
  }

  const pool = getPool();
  // This excludes anything with site_license null or {}.

  const { rows } = await pool.query(
    `SELECT project_id, title, site_license,
    users#>'{${account_id},hide}' as hidden,
    state#>'{state}' as state,
    last_edited
    FROM projects
    WHERE users ? '${account_id}' AND site_license != '{}'
    ORDER BY last_edited DESC`,
    [],
  );
  toEpoch(rows, ["last_edited"]);
  return rows;
}
