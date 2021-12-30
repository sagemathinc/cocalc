/*
Search for users.


*/

import getPool from "@cocalc/database/pool";
import {
  cmp,
  isValidUUID,
  is_valid_email_address as isValidEmailAddress,
  parse_user_search as parseUserSearch,
} from "@cocalc/util/misc";
import { toEpoch } from "@cocalc/database/postgres/util";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("accounts/search");

export interface User {
  account_id: string;
  first_name?: string;
  last_name?: string;
  last_active?: number; // ms since epoch -- when account was last active
  created?: number; // ms since epoch -- when account created
  banned?: boolean; // true if this user has been banned (only set for admin searches, obviously)
  email_address_verified?: boolean; // true if their email has been verified (a sign they are more trustworthy).
  // For security reasons, the email_address *only* occurs in search queries that
  // are by email_address (or for admins); we must not reveal email addresses
  // of users queried by substring searches, obviously.
  email_address?: string;
}

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
}

export default async function search({
  /* account_id,*/
  query,
  limit,
  admin,
}: Options): Promise<User[]> {
  limit = limit ?? 20;
  admin = !!admin;
  logger.debug("search for ", query);

  // One special case: when the query is just an email address or uuid.
  // We just return that account or empty list if no match.
  if (isValidUUID(query)) {
    logger.debug("get user by account_id");
    const user = process(await getUserByAccountId(query), admin);
    return user ? [user] : [];
  }
  if (isValidEmailAddress(query)) {
    logger.debug("get user by email address");
    const user = process(await getUserByEmailAddress(query), admin);
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

  const matches: DBUser[] = await getUsersByEmailAddresses(
    email_queries,
    limit
  );
  matches.push(
    ...(await getUsersByStringQueries(
      string_queries,
      admin,
      limit - matches.length
    ))
  );
  const results: User[] = [];
  for (const user of matches) {
    const x = process(user, admin);
    if (x) {
      results.push(x);
    }
  }

  return results.sort((a, b) => {
    const a0 = (a.first_name + " " + a.last_name).toLowerCase();
    const b0 = (b.first_name + " " + b.last_name).toLowerCase();
    const c = cmp(a0, b0);
    if (c) {
      return c;
    }
    return -cmp(
      a.last_active ?? a.created ?? 0,
      b.last_active ?? b.created ?? 0
    );
  });
}

function process(
  user: DBUser | undefined,
  admin: boolean = false
): User | undefined {
  if (user == null) return undefined;
  const x: any = { ...user };
  //TODO
  if (!admin) {
    delete x.email_address;
    delete x.banned;
  }
  toEpoch(x, ["last_active", "created"]);
  // TODO: do something with email_address_verified
  return x;
}

const FIELDS =
  " account_id, first_name, last_name, email_address, last_active, created, banned, email_address_verified ";

async function getUserByEmailAddress(
  email_address: string
): Promise<DBUser | undefined> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM accounts WHERE email_address=$1`,
    [email_address.toLowerCase()]
  );
  return rows[0];
}

async function getUserByAccountId(
  account_id: string
): Promise<DBUser | undefined> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM accounts WHERE account_id=$1`,
    [account_id.toLowerCase()]
  );
  return rows[0];
}

async function getUsersByEmailAddresses(
  email_queries: string[],
  limit: number
): Promise<DBUser[]> {
  logger.debug("getUsersByEmailAddresses", email_queries);
  if (email_queries.length == 0 || limit <= 0) return [];

  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM accounts WHERE email_address = ANY($1::TEXT[]) AND deleted IS NULL`,
    [email_queries]
  );
  return rows;
}

async function getUsersByStringQueries(
  string_queries: string[][],
  admin: boolean,
  limit: number
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
        `(lower(first_name) LIKE $${i}::TEXT OR lower(last_name) LIKE $${i}::TEXT ${
          admin ? `OR lower(email_address) LIKE $${i}::TEXT` : ""
        })`
      );
      params.push(`%${s}%`);
      i += 1;
    }
    where.push(`(${v.join(" AND ")})`);
  }

  let query = `SELECT ${FIELDS} FROM accounts WHERE deleted IS NOT TRUE AND (${where.join(
    " OR "
  )})`;

  if (!admin) {
    // Exclude unlisted users from search results
    query += " AND unlisted IS NOT true ";
  }
  // recently active users are much more relevant than old ones -- #2991
  query += " ORDER BY last_active DESC NULLS LAST";
  query += ` LIMIT $${i}::INTEGER `;
  i += 1;
  params.push(limit);

  const pool = getPool("medium");
  const { rows } = await pool.query(query, params);
  return rows;
}
