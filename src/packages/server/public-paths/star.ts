import getPool from "@cocalc/database/pool";

async function checkPathExists(public_path_id: string): Promise<void> {
  if (typeof public_path_id != "string" || public_path_id.length != 40) {
    throw Error(`invalid public path id ${public_path_id}`);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*)::INT FROM public_paths WHERE id=$1",
    [public_path_id]
  );
  if (rows[0].count == 0) {
    throw Error(`no public path with id ${public_path_id}`);
  }
}

export async function star(
  public_path_id: string,
  account_id: string
): Promise<void> {
  await checkPathExists(public_path_id);
  const pool = getPool();
  await pool.query(
    "INSERT INTO public_path_stars (public_path_id, account_id, time) VALUES($1,$2,NOW())",
    [public_path_id, account_id]
  );
}

export async function unstar(
  public_path_id: string,
  account_id: string
): Promise<void> {
  await checkPathExists(public_path_id);
  const pool = getPool();
  await pool.query(
    "DELETE FROM public_path_stars WHERE public_path_id=$1 AND account_id=$2",
    [public_path_id, account_id]
  );
}

// see https://stackoverflow.com/questions/66389300/postgres-cast-count-as-integer for why ::int is needed; it's due to BigInt.
export async function numStars(public_path_id: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=$1",
    [public_path_id]
  );
  return rows[0].count ?? 0;
}

export async function isStarred(
  public_path_id: string,
  account_id: string
): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=$1 AND account_id=$2",
    [public_path_id, account_id]
  );
  return rows[0].count > 0;
}

export async function getStars(
  account_id: string
): Promise<{ public_path_id: string; path?: string; name?: string }[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT public_path_id FROM public_path_stars WHERE account_id=$1",
    [account_id]
  );
  return rows;
}
