import getPool from "@cocalc/database/pool";

// Get the license id for a public path.  Returns null if the public path
// has no license or is NOT unlisted.  We only ever want to use licenses
// with unlisted paths, for obvious abuse prevention reasons.
export default async function getSiteLicenseId(
  id: string
): Promise<string | null> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT site_license_id FROM public_paths WHERE id=$1 AND unlisted=true",
    [id]
  );
  return rows[0]?.site_license_id ?? null;
}
