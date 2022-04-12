import getPool from "@cocalc/database/pool";

const Q_EXISTS_DISK = `
SELECT EXISTS(
    SELECT 1
    FROM site_licenses
    WHERE quota -> 'dedicated_disk' IS NOT NULL
      AND quota -> 'dedicated_disk' ->> 'name' = $1
)`;

export default async function checkDedicateDiskName(
  name?: string
): Promise<{ available: boolean }> {
  if (typeof name !== "string") {
    throw new Error(`name must be a string`);
  }
  const pool = getPool();
  const { rows } = await pool.query(Q_EXISTS_DISK, [name]);
  if (rows[0].exists) {
    throw new Error(`Disk name ${name} is already taken`);
  }

  return { available: true };
}
