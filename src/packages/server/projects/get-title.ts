import getPool from "@cocalc/database/pool";

export default async function getTitle(project_id: string): Promise<string> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT title FROM projects WHERE project_id=$1",
    [project_id]
  );
  return rows[0]?.title ?? "Untitled Project";
}
