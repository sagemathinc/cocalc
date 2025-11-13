import exec from "@cocalc/server/compute/exec";
import getPool from "@cocalc/database/pool";

// Returns the number of mounted cloud file systems in the given project
export async function numMounted(project_id: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM cloud_filesystems WHERE project_id=$1 AND mount",
    [project_id],
  );
  return rows[0].count;
}

// Attempt to unmount cloud file systems on the given compute server.
// This just tries to stop the cloud-filesystem docker container, which
// has unmounting as a side effect.  This doesn't have anything to do
// with setting the mount/unmount state in the database.  We use this,
// e.g., before suspending since having a cloud file system running while
// suspended could lead to problems upon resuming (e.g., metadata loss).
// There is no guarantee this worked.
export async function unmountAll({
  id,
  account_id,
}: {
  // id of compute server
  id: number;
  // account_id of user doing the action.
  account_id: string;
}) {
  await exec({
    id,
    account_id,
    execOpts: {
      command: "docker",
      args: ["stop", "cloud-filesystem"],
      err_on_exit: false,
      timeout: 10,
    },
  });
}
