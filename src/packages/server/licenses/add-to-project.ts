import getPool, { PoolClient } from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";

interface Options {
  project_id: string;
  license_id: string;
  client?: PoolClient;
}

// Set the [license_id] key of the site_license field of the entry
// in the PostgreSQL projects table with given project_id to {}.
// The site_license field is JSONB.
export default async function addLicenseToProject({
  project_id,
  license_id,
  client,
}: Options) {
  if (!isValidUUID(license_id)) {
    throw Error("license_id must be a valid uuid");
  }
  const pool = client ?? getPool();
  await pool.query(
    `
UPDATE projects
SET site_license = coalesce(site_license,'{}'::jsonb) || JSONB_BUILD_OBJECT($2::VARCHAR, '{}'::jsonb)
WHERE project_id = $1
`,
    [project_id, license_id]
  );
}
