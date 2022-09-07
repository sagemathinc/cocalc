import getPool from "@cocalc/database/pool";

export async function getProjectAvatarTiny(
  project_id: string
): Promise<string | undefined> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT avatar_image_tiny FROM projects WHERE project_id=$1",
    [project_id]
  );
  return rows[0].avatar_image_tiny;
}
