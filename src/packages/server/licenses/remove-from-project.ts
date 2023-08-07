import getPool, { PoolClient } from "@cocalc/database/pool";

interface Options {
  project_id: string;
  license_id: string;
  client?: PoolClient;
}

// Set the [license_id] key of the site_license field of the entry
// in the PostgreSQL projects table with given project_id to {}.
// The site_license field is JSONB.
export default async function removeLicenseFromProject({
  project_id,
  license_id,
  client,
}: Options) {
  const pool = client ?? getPool();
  await pool.query(
    `
  UPDATE projects SET site_license = site_license - $1 WHERE project_id = $2
`,
    [license_id, project_id]
  );
}
