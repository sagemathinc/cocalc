/* Get basic information about a user or organization
from the database.  This should be enough to render
a nice "homepage" for that user or organization.
*/

import LRU from "lru-cache";
import { reuseInFlight } from "async-await-utils/hof";
import getPool from "@cocalc/util-node/database";

// Throws an exception if there is no account or org with this name.
// TODO: take into account redirects for when name is changed.

// To avoid overfetching, we cache results for *a few seconds*.
const cache = new LRU<string, Owner>({ maxAge: 1000 * 15, max: 10000 });

interface Owner {
  type: "account" | "organization";
  owner_id: string;
}

export default async function getOwner(owner: string): Promise<Owner> {
  if (cache.has(owner)) {
    return cache.get(owner);
  }
  const x = await getOwnerNoCache(owner);
  cache.set(owner, x);
  return x;
}

const getOwnerNoCache = reuseInFlight(async (owner: string) => {
  const pool = getPool();
  // Is it an account?
  let result = await pool.query(
    "SELECT account_id FROM accounts WHERE LOWER(name)=$1",
    [owner.toLowerCase()]
  );
  if (result.rows.length > 0) {
    return { type: "account", owner_id: result.rows[0].account_id };
  }
  // Is it an organization?
  result = await pool.query(
    "SELECT title, description, organization_id FROM organizations WHERE LOWER(name)=$1",
    [owner.toLowerCase()]
  );
  if (result.rows.length > 0) {
    return { type: "organization", owner_id: result.rows[0].organization_id };
  }
  throw Error(`no account or organization '${owner}'`);
});
