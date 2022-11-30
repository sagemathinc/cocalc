import getPool from "@cocalc/database/pool";

// Return the id of a site license if it should be applied to projects that use
// the given shared document.  Otherwise, return null;
export async function associatedLicense(
  public_path_id: string
): Promise<string | null> {
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT site_license_id, disabled, unlisted FROM public_paths WHERE id=$1",
    [public_path_id]
  );
  const { disabled, unlisted, site_license_id } = rows[0] ?? {};
  if (site_license_id && !disabled && unlisted) {
    // These are the only conditions under which we would apply a license.
    // Apply site_license_id to project_id.
    return site_license_id;
  }
  return null;
}
