import getPool, { timeInSeconds } from "@cocalc/database/pool";
import { isUUID } from "./util";
import { PublicPath } from "./types";

export interface AccountInfo {
  account_id: string;
  first_name: string;
  last_name: string;
  name: string;
  publicPaths: PublicPath[];
}

export default async function getAccountInfo(
  account_id: string
): Promise<AccountInfo> {
  return {
    account_id,
    ...(await getName(account_id)),
    publicPaths: await getPublicPaths(account_id),
  };
}

export async function getName(account_id: string): Promise<{
  first_name: string;
  last_name: string;
  name: string;
  email_address: string;
}> {
  if (!isUUID(account_id)) {
    throw Error("invalid UUID");
  }
  const pool = getPool("long");

  // Get the database entry
  const { rows } = await pool.query(
    "SELECT name, first_name, last_name, email_address FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    throw Error("no such user");
  }
  return {
    first_name: rows[0].first_name,
    last_name: rows[0].last_name,
    name: rows[0].name,
    email_address: rows[0].email_address,
  };
}

export async function getPublicPaths(
  account_id: string
): Promise<PublicPath[]> {
  if (!isUUID(account_id)) {
    // VERY important to check this because we substitute the account_id
    // into the query string directly, and this is input directly from the user!
    throw Error("invalid UUID");
  }
  const pool = getPool("medium");

  // Returns public paths for which account_id is a collaborator on the project and they have
  // actively used the project at some point.
  // We sort from most recently edited.
  const query = `SELECT public_paths.id as id, public_paths.path as path, public_paths.description as description,
  public_paths.disabled as disabled, public_paths.unlisted as unlisted, public_paths.vhost as vhost,
  ${timeInSeconds(
    "public_paths.last_edited",
    "last_edited"
  )} FROM public_paths, projects WHERE public_paths.project_id = projects.project_id AND projects.last_active ? '${account_id}' AND projects.users ? '${account_id}'  ORDER BY public_paths.last_edited DESC`;
  const { rows } = await pool.query(query);
  return rows;
}
