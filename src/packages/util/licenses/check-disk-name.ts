/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: you might wonder, why to check for unique names? wouldn't something random be fine?
// well, there is a case where more than one disk is mounted in a project.
// By tying the name to the license, it is always clear which disk is which.

const Q_EXISTS_DISK = `
SELECT EXISTS(
    SELECT 1
    FROM site_licenses
    WHERE quota -> 'dedicated_disk' IS NOT NULL
      AND quota -> 'dedicated_disk' ->> 'name' = $1
)`;

export default async function checkDedicateDiskName(
  pool,
  name?: string
): Promise<{ available: boolean }> {
  if (typeof name !== "string") {
    throw new Error(`name must be a string`);
  }
  const { rows } = await pool.query(Q_EXISTS_DISK, [name]);
  if (rows[0].exists) {
    throw new Error(`Disk name ${name} is already taken`);
  }

  return { available: true };
}
