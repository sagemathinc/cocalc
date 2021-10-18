import getPool from "@cocalc/backend/database";

export default async function getRequiresTokens(): Promise<boolean> {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM registration_tokens WHERE disabled IS NOT true) AS have_tokens"
  );
  return !!rows[0]?.have_tokens;
}
