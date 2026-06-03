/*
Returns array of projects with a given license applied to them, including the following info:

- project_id
- title: of project
- quota: what upgrades from license are being used right now, if any
- last_edited: when project last_edited
- collaborators: account_id's of collaborators on the project
*/

import getPool from "@cocalc/database/pool";
import { toEpoch } from "@cocalc/database/postgres/utils/to-epoch";
import { isValidUUID } from "@cocalc/util/misc";
import { State } from "@cocalc/util/compute-states";

export interface Project {
  project_id: string;
  title: string;
  quota: object;
  last_edited: number; // ms since epoch
  state?: State;
  collaborators: string[];
}

export default async function getProjectsWithLicense(
  license_id: string,
): Promise<Project[]> {
  if (!isValidUUID(license_id)) {
    // importand due to sql injection
    throw Error("invalid license_id -- must be a uuid");
  }

  const pool = getPool("medium");

  const { rows } = await pool.query(
    `SELECT project_id, title, site_license#>'{${license_id},quota}' as quota,
    ARRAY(SELECT jsonb_object_keys(users)) as collaborators,
    state#>'{state}' as state,
    last_edited
    FROM projects
    WHERE site_license ? '${license_id}'
    ORDER BY last_edited DESC`,
    [],
  );
  toEpoch(rows, ["last_edited"]);
  return rows;
}
