import getPool, { PoolClient } from "@cocalc/database/pool";

interface Options {
  project_id: string;
  client?: PoolClient;
}

// Set the site_license field of the entry in the PostgreSQL projects table with given
// project_id to {}. The site_license field is JSONB.
//
export default async function removeAllLicensesFromProject({
  project_id,
  client,
}: Options) {
  const pool = client ?? getPool();
  await pool.query(
    `
  UPDATE projects SET site_license = '{}'::JSONB WHERE project_id = $1
`,
    [project_id],
  );
}
