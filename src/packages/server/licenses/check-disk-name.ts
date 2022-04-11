import getPool from "@cocalc/database/pool";

const DEDI_DISK_NAMES = `
SELECT quota -> 'dedicated_disk' ->> 'name' as name
FROM site_licenses
WHERE quota -> 'dedicated_disk' IS NOT NULL`;

export default async function checkDedicateDiskName(
  name?: string
): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query(DEDI_DISK_NAMES);
  for (const row of rows) {
    if (row.name === name) {
      throw new Error(`Disk name ${name} is already taken`);
    }
  }

  if (name?.length == 8) {
    throw Error("disk name is not valid");
  }
  return; // all good
}
