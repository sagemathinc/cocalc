/*
Search for users.

- by exact account_id
- by exact email_address
- by partial match on first_name and last_name
- by @username
*/

import getPool from "@cocalc/database/pool";
import {
  cmp,
  isValidUUID,
  is_valid_email_address as isValidEmailAddress,
  parse_user_search as parseUserSearch,
} from "@cocalc/util/misc";
import { toEpoch } from "@cocalc/database/postgres/utils/to-epoch";
import { getLogger } from "@cocalc/backend/logger";
import {
  USER_SEARCH_LIMIT,
  ADMIN_SEARCH_LIMIT,
  type UserSearchResult as User,
} from "@cocalc/util/db-schema/accounts";
export { type User };

const logger = getLogger("accounts/search");

interface DBUser {
  account_id: string;
  first_name?: string;
  last_name?: string;
  last_active?: Date;
  created?: number;
  banned?: boolean;
  email_address_verified?: object;
  email_address?: string;
}

interface Options {
  // query: comma separated list of email addresses or strings such as
  //        'foo bar' (find everything where foo and bar are in the name)
  query: string;
  // limit on string queries; email query always returns 0 or 1 result per email address
  // the default is 20.  Ordered by last_active, starting with most recently active first.
  limit?: number;
  // If account is given, we do a first phase of search on current collaborators of this user,
  // and only then do a general search (up to the limit).
  //account_id?: string;
  // admins get to do full substring query on *email addresses*, whereas normal
  // users can only find a user by exact email address match (or substring query on name).
  // Also, admins get unlisted users, whereas non-admins never find them except by
  // exact email address search.
  admin?: boolean;
  // If true, we only search using the email address
  only_email?: boolean;
}

export default async function search({
  /* account_id,*/
  query,
  limit,
  admin,
  only_email,
}: Options): Promise<User[]> {
  limit = limit ?? 20;
  admin = !!admin;
  logger.debug("search for ", query);

  if (admin) {
    limit = Math.min(limit, ADMIN_SEARCH_LIMIT);
  } else {
    limit = Math.min(limit, USER_SEARCH_LIMIT);
  }

  // One special case: when the query is just an email address or uuid.
  // We just return that account or empty list if no match.
  if (isValidUUID(query)) {
    logger.debug("get user by account_id or project_id");
    const user = process(await getUserByAccountId(query), admin, false);
    const result: User[] = user ? [user] : [];
    if (result.length == 0 && admin) {
      // try project_id
      for (const collab of await getCollaborators(query)) {
        const u = process(collab, admin, false);
        if (u != null) {
          result.push(u);
        }
      }
    }
    return result;
  }
  if (isValidEmailAddress(query)) {
    logger.debug("get user by email address");
    const user = process(await getUserByEmailAddress(query), admin, true);
    return user ? [user] : [];
  }

  const { string_queries, email_queries } = parseUserSearch(query);
  if (admin) {
    // For admin we just do substring queries anyways.
    for (const email_address of email_queries) {
      string_queries.push([email_address]);
    }
    email_queries.splice(0, email_queries.length); // empty array
  }

  const results: User[] = [];
  let matches: DBUser[] = await getUsersByEmailAddresses(email_queries, limit);

  for (const user of matches) {
    const x = process(user, admin, true);
    if (x) {
      results.push(x);
    }
  }

  if (!only_email) {
    matches = await getUsersByStringQueries(
      string_queries,
      admin,
      limit - matches.length,
    );
    for (const user of matches) {
      const x = process(user, admin, false);
      if (x) {
        results.push(x);
      }
    }
  }

  results.sort(
    (a, b) =>
      -cmp(
        Math.max(a.last_active ?? 0, a.created ?? 0),
        Math.max(b.last_active ?? 0, b.created ?? 0),
      ),
  );
  return results;
}

function process(
  user: DBUser | undefined,
  admin: boolean = false,
  isEmailSearch: boolean,
): User | undefined {
  if (user == null) {
    return undefined;
  }
  const x: any = { ...user };
  if (x.email_address && x.email_address_verified) {
    x.email_address_verified =
      x.email_address_verified[x.email_address] != null;
  }
  if (!admin) {
    if (!isEmailSearch) {
      delete x.email_address;
    }
    delete x.banned;
  }
  toEpoch(x, ["last_active", "created"]);
  return x;
}

const FIELDS =
  " account_id, first_name, last_name, name, email_address, last_active, created, banned, email_address_verified ";

async function getUserByEmailAddress(
  email_address: string,
): Promise<DBUser | undefined> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM accounts WHERE email_address=$1`,
    [email_address.toLowerCase()],
  );
  return rows[0];
}

async function getUserByAccountId(
  account_id: string,
): Promise<DBUser | undefined> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM accounts WHERE account_id=$1`,
    [account_id.toLowerCase()],
  );
  return rows[0];
}

// only for admin search
async function getCollaborators(project_id: string): Promise<DBUser[]> {
  const pool = getPool("medium");
  let subQuery = `SELECT jsonb_object_keys(users) AS account_id FROM projects WHERE project_id=$1`;
  const queryParams = [project_id];
  const fields = FIELDS.split(",")
    .map((x) => `accounts.${x.trim()}`)
    .join(", ");
  const result = await pool.query(
    `SELECT ${fields} FROM accounts, (${subQuery})
        AS users WHERE accounts.account_id=users.account_id::UUID`,
    queryParams,
  );
  return result.rows;
}

async function getUsersByEmailAddresses(
  email_queries: string[],
  limit: number,
): Promise<DBUser[]> {
  logger.debug("getUsersByEmailAddresses", email_queries);
  if (email_queries.length == 0 || limit <= 0) return [];

  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM accounts WHERE email_address = ANY($1::TEXT[]) AND deleted IS NULL`,
    [email_queries],
  );
  return rows;
}

async function getUsersByStringQueries(
  string_queries: string[][],
  admin: boolean,
  limit: number,
): Promise<DBUser[]> {
  logger.debug("getUsersByStringQueries", string_queries);
  if (limit <= 0 || string_queries.length <= 0) {
    return [];
  }

  /*  Substring search on first and last name, and for admin also email_address.
      With the two indexes, the query below is very fast, even on millions of accounts:
          CREATE INDEX accounts_first_name_idx ON accounts(first_name text_pattern_ops);
          CREATE INDEX accounts_last_name_idx  ON accounts(last_name text_pattern_ops);
  */
  const params: (string | number)[] = [];
  const where: string[] = [];
  let i = 1;
  for (const terms of string_queries) {
    const v: string[] = [];
    for (const s of terms) {
      v.push(
        `(lower(first_name) LIKE $${i}::TEXT OR lower(last_name) LIKE $${i}::TEXT OR '@' || lower(name) LIKE $${i}::TEXT ${
          admin ? `OR lower(email_address) LIKE $${i}::TEXT` : ""
        })`,
      );
      params.push(`%${s}%`);
      i += 1;
    }
    where.push(`(${v.join(" AND ")})`);
  }

  let query = `SELECT ${FIELDS} FROM accounts WHERE deleted IS NOT TRUE AND (${where.join(
    " OR ",
  )})`;

  if (!admin) {
    // Exclude unlisted users from search results
    query += " AND unlisted IS NOT true ";
  }
  // recently active users are much more relevant than old ones -- #2991
  query += " ORDER BY COALESCE(last_active, created) DESC NULLS LAST";
  query += ` LIMIT $${i}::INTEGER `;
  i += 1;
  params.push(limit);

  const pool = getPool("medium");
  const { rows } = await pool.query(query, params);
  return rows;
}
