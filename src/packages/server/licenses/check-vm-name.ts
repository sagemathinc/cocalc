import getPool from "@cocalc/database/pool";

const Q_EXISTS_VM = `
SELECT EXISTS(
    SELECT 1
    FROM site_licenses
    WHERE quota -> 'dedicated_vm' IS NOT NULL
      AND quota -> 'dedicated_vm' ->> 'name' = $1
)`;

export default async function checkDedicateVmName(
  name?: string
): Promise<{ available: boolean }> {
  if (typeof name !== "string") {
    throw new Error(`name must be a string`);
  }
  const pool = getPool();
  const { rows } = await pool.query(Q_EXISTS_VM, [name]);
  if (rows[0].exists) {
    throw new Error(`Disk name ${name} is already taken`);
  }

  return { available: true };
}
