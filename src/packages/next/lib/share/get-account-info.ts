import getPool, { timeInSeconds } from "@cocalc/util-node/database";
import { isUUID } from "./util";
import { PublicPath } from "./types";

export interface AccountInfo {
  accountID: string;
  firstName: string;
  lastName: string;
  name: string;
  publicPaths: PublicPath[];
}

export default async function getAccountInfo(
  accountID: string
): Promise<AccountInfo> {
  return {
    accountID,
    ...(await getName(accountID)),
    publicPaths: await getPublicPaths(accountID),
  };
}

export async function getName(
  accountID: string
): Promise<{ firstName: string; lastName: string; name: string }> {
  if (!isUUID(accountID)) {
    throw Error("invalid UUID");
  }
  const pool = getPool('medium');

  // Get the database entry
  const { rows } = await pool.query(
    "SELECT name, first_name, last_name FROM accounts WHERE account_id=$1",
    [accountID]
  );
  if (rows.length == 0) {
    throw Error("no such user");
  }
  return {
    firstName: rows[0].first_name,
    lastName: rows[0].last_name,
    name: rows[0].name,
  };
}

export async function getPublicPaths(accountID: string): Promise<PublicPath[]> {
  if (!isUUID(accountID)) {
    // VERY important to check this because we substitute the accountID
    // into the query string directly, and this is input directly from the user!
    throw Error("invalid UUID");
  }
  const pool = getPool('medium');

  // Returns public paths for which account_id is a collaborator on the project that has
  // actively used the project.
  // It might be more useful to additionally filter using the syncstrings
  // table for documents that account_id actually edited, but that's a lot harder.
  // We sort from most recently edited.
  const query = `SELECT public_paths.id as id, public_paths.path as path, public_paths.description as description, ${timeInSeconds(
    "public_paths.last_edited",
    "last_edited"
  )} FROM public_paths, projects WHERE public_paths.project_id = projects.project_id AND projects.last_active ? '${accountID}' AND projects.users ? '${accountID}' AND (public_paths.unlisted is null OR public_paths.unlisted = false) AND (public_paths.disabled is null OR public_paths.disabled = false) AND (public_paths.vhost is null OR public_paths.vhost = '') ORDER BY public_paths.last_edited DESC`;
  const { rows } = await pool.query(query);
  const publicPaths: PublicPath[] = [];
  for (const x of rows) {
    publicPaths.push({
      id: x.id,
      path: x.path,
      description: x.description,
      last_edited: x.last_edited,
    });
  }
  return publicPaths;
}
