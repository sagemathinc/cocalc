/*
This supports three actions:

- get: get the already created keys associated to an account or project
- delete: delete a specific key given by an id
- create: create a new api key associated to an account or project
- edit: edit an existing api key: you can change the name and expiration date

If the user has a password, then it must be provided and be correct. If
they have no password, then the provided one is ignored.
*/

import getPool from "@cocalc/database/pool";
import { generate } from "random-key";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import passwordHash, {
  verifyPassword,
} from "@cocalc/backend/auth/password-hash";
import { getLogger } from "@cocalc/backend/logger";
import base62 from "base62/lib/ascii";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import type {
  ApiKey as ApiKeyType,
  Action as ApiKeyAction,
} from "@cocalc/util/db-schema/api-keys";
import isBanned from "@cocalc/server/accounts/is-banned";

const log = getLogger("server:api:manage");

// API key format: new keys start with this prefix (old ones used "sk_")
const API_KEY_PREFIX = "sk-";

// Global per user limit to avoid abuse/bugs.  Nobody should ever hit this.
// Since we use a separate key per compute server, and definitely want some users
// to create 5K compute servers at once, don't make this too small.
const MAX_API_KEYS = 100000;

// PostgreSQL SERIAL type max value (32-bit signed integer)
const MAX_SERIAL = 2147483647;

// Converts any 32-bit nonnegative integer as a 6-character base-62 string.
function encode62(n: number): string {
  if (!Number.isInteger(n)) {
    throw Error("n must be an integer");
  }
  return base62.encode(n).padStart(6, "0");
}

function decode62(s: string): number {
  return base62.decode(s);
}

interface Options {
  account_id: string;
  action: ApiKeyAction;
  project_id?: string;
  name?: string;
  expire?: Date;
  id?: number;
}

// this does NOT trust its input.
export default async function manageApiKeys({
  account_id,
  action,
  project_id,
  name,
  expire,
  id,
}: Options): Promise<undefined | ApiKeyType[]> {
  log.debug("manage", { account_id, project_id, action, name, expire, id });
  if (!(await isValidAccount(account_id))) {
    throw Error("account_id is not a valid account");
  }

  // Now we allow the action.
  if (
    project_id != null &&
    !(await isCollaborator({ account_id, project_id }))
  ) {
    throw Error(
      "user must be collaborator on project to manage project_id api keys",
    );
  }

  return await doManageApiKeys({
    action,
    account_id,
    project_id,
    name,
    expire,
    id,
  });
}

// Return all api keys for the given account_id or project_id.
// No security checks.
async function getApiKeys({
  account_id,
  project_id,
}: {
  account_id: string;
  project_id?: string;
}): Promise<ApiKeyType[]> {
  log.debug("getProjectApiKeys", project_id);
  const pool = getPool();
  if (project_id) {
    const { rows } = await pool.query(
      "SELECT id,account_id,expire,created,name,trunc,last_active FROM api_keys WHERE project_id=$1::UUID ORDER BY created DESC",
      [project_id],
    );
    return rows;
  } else {
    const { rows } = await pool.query(
      "SELECT id,account_id,expire,created,name,trunc,last_active FROM api_keys WHERE account_id=$1::UUID AND project_id IS NULL ORDER BY created DESC",
      [account_id],
    );
    return rows;
  }
}

async function getApiKey({ id, account_id, project_id }) {
  const pool = getPool();
  if (project_id) {
    const { rows } = await pool.query(
      "SELECT id,account_id,expire,created,name,trunc,last_active FROM api_keys WHERE id=$1 AND project_id=$2",
      [id, project_id],
    );
    return rows[0];
  } else {
    const { rows } = await pool.query(
      "SELECT id,account_id,expire,created,name,trunc,last_active FROM api_keys WHERE id=$1 AND account_id=$2",
      [id, account_id],
    );
    return rows[0];
  }
}

// We require the account_id here even though the id would technically suffice,
// so a user can't just delete random api keys they don't own.
// Edge case: we're not allowing
async function deleteApiKey({ account_id, project_id, id }) {
  const pool = getPool();
  if (project_id) {
    // We allow a collab on a project to delete any api key for that project,
    // even from another user.  This increases security, rather than reducing it.
    await pool.query("DELETE FROM api_keys WHERE project_id=$1 AND id=$2", [
      project_id,
      id,
    ]);
  } else {
    await pool.query("DELETE FROM api_keys WHERE account_id=$1 AND id=$2", [
      account_id,
      id,
    ]);
  }
}

async function numKeys(account_id: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM api_keys WHERE account_id=$1",
    [account_id],
  );
  return rows[0].count;
}

async function createApiKey({
  account_id,
  project_id,
  expire,
  name,
}: {
  account_id: string;
  project_id?: string;
  expire?: Date;
  name: string;
}): Promise<ApiKeyType> {
  const pool = getPool();
  if ((await numKeys(account_id)) >= MAX_API_KEYS) {
    throw Error(
      `There is a limit of ${MAX_API_KEYS} per account; please delete some api keys.`,
    );
  }
  const { rows } = await pool.query(
    "INSERT INTO api_keys(account_id,created,project_id,expire,name) VALUES($1,NOW(),$2,$3,$4) RETURNING id,account_id,expire,created,name,last_active",
    [account_id, project_id, expire, name],
  );
  const { id } = rows[0];
  // We encode the id in the secret so when the user presents the secret we can find the record.
  // Note that passwordHash is NOT a "function" -- due to salt every time you call it, the output is different!
  // Thus we have to do this little trick.
  // New ones start with API_KEY_PREFIX and old with sk_.
  const secret = `${API_KEY_PREFIX}${generate(16)}${encode62(id)}`;
  const trunc = secret.slice(0, 3) + "..." + secret.slice(-6);
  const hash = passwordHash(secret);
  await pool.query("UPDATE api_keys SET trunc=$1,hash=$2 WHERE id=$3", [
    trunc,
    hash,
    id,
  ]);
  return { ...rows[0], trunc, secret };
}

async function updateApiKey({ apiKey, account_id, project_id }) {
  log.debug("udpateApiKey", apiKey);
  const pool = getPool();
  const { id, expire, name, last_active } = apiKey;
  if (project_id) {
    // including account_id and project_id so so you can't edit an api_key
    // for some other random project or user.
    await pool.query(
      "UPDATE api_keys SET expire=$3,name=$4,last_active=$5 WHERE id=$1 AND project_id=$2",
      [id, project_id, expire, name, last_active],
    );
  } else {
    await pool.query(
      "UPDATE api_keys SET expire=$3,name=$4,last_active=$5 WHERE id=$1 AND account_id=$2",
      [id, account_id, expire, name, last_active],
    );
  }
}

//api_key.slice(0, 3) + "..." + api_key.slice(-4)
// This function does no auth checks.
async function doManageApiKeys({
  action,
  account_id,
  project_id,
  name,
  expire,
  id,
}) {
  switch (action) {
    case "get":
      if (!id) {
        return await getApiKeys({ account_id, project_id });
      } else {
        return [await getApiKey({ id, account_id, project_id })];
      }

    case "delete":
      // delete key with given id
      await deleteApiKey({ account_id, project_id, id });
      break;

    case "create":
      // creates a key with given name (if given)
      return [await createApiKey({ account_id, project_id, name, expire })];

    case "edit": // change the name or expire time
      const apiKey = await getApiKey({ id, account_id, project_id });
      if (apiKey == null) {
        throw Error(`no api key with id ${id}`);
      }
      let changed = false;
      if (name != null && apiKey.name != name) {
        apiKey.name = name;
        changed = true;
      }
      if (expire !== undefined && apiKey.expire != expire) {
        apiKey.expire = expire;
        changed = true;
      }
      if (changed) {
        await updateApiKey({ apiKey, account_id, project_id });
      }
      break;
  }
}

/*
Get the account ({account_id} or {project_id}!) that has the given api key,
or returns undefined if there is no such account, or if the account
that owns the api key is banned.

If the api_key is not an account wide key, instead return the project_id
if the key is a valid key for a project.

Record that access happened by updating last_active.
*/
export async function getAccountWithApiKey(
  secret: string,
): Promise<
  | { account_id: string; project_id?: undefined }
  | { account_id?: undefined; project_id: string }
  | undefined
> {
  log.debug("getAccountWithApiKey");
  const pool = getPool("medium");

  // Validate secret format
  if (!secret || typeof secret !== "string") {
    log.debug("getAccountWithApiKey: invalid secret - not a string");
    return;
  }

  // Check for legacy account api key (format historically documented as sk-*, but
  // some deployments used sk_*, so accept both to avoid breaking existing keys)
  if (secret.startsWith(API_KEY_PREFIX) || secret.startsWith("sk_")) {
    const { rows } = await pool.query(
      "SELECT account_id FROM accounts WHERE api_key = $1::TEXT",
      [secret],
    );
    if (rows.length > 0) {
      const account_id = rows[0].account_id;
      if (await isBanned(account_id)) {
        log.debug("getAccountWithApiKey: banned api key ", account_id);
        return;
      }
      // it's a valid account api key
      log.debug("getAccountWithApiKey: valid api key for ", account_id);
      return { account_id };
    }
  }

  // Check new api_keys table (format: {API_KEY_PREFIX}{random_16_chars}{base62_encoded_id})
  // Expected length: 3 + 16 + 6 = 25 characters minimum
  if (!secret.startsWith(API_KEY_PREFIX) || secret.length < 9) {
    log.debug("getAccountWithApiKey: invalid api key format", {
      startsWithPrefix: secret.startsWith(API_KEY_PREFIX),
      length: secret.length,
    });
    return;
  }

  // Decode the last 6 characters as base62 to get the ID
  let id: number;
  try {
    id = decode62(secret.slice(-6));
  } catch (err) {
    log.debug("getAccountWithApiKey: failed to decode api key id", {
      suffix: secret.slice(-6),
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Validate that ID is within valid PostgreSQL SERIAL (32-bit) range
  if (!Number.isInteger(id) || id < 0 || id > MAX_SERIAL) {
    log.debug("getAccountWithApiKey: decoded id out of valid range", {
      id,
      max: MAX_SERIAL,
    });
    return;
  }

  const { rows } = await pool.query(
    "SELECT account_id,project_id,hash,expire FROM api_keys WHERE id=$1",
    [id],
  );
  if (rows.length == 0) return undefined;
  if (await isBanned(rows[0].account_id)) {
    log.debug("getAccountWithApiKey: banned api key ", rows[0]?.account_id);
    return;
  }
  if (verifyPassword(secret, rows[0].hash)) {
    // If project and account_id no longer a collab, then we delete the key and fail.
    // I.e., if you reate an api key for a project, then you stop collab on that
    // project, then your api key will automatically stop working.
    if (rows[0].project_id && !(await isCollaborator(rows[0]))) {
      await deleteApiKey({ ...rows[0], id });
      return undefined;
    }
    const { expire } = rows[0];
    if (expire != null && expire.valueOf() <= Date.now()) {
      // expired entries will get automatically deleted eventually by database
      // maintenance, but we obviously shouldn't depend on that.
      await deleteApiKey({ ...rows[0], id });
      return undefined;
    }

    // Yes, caller definitely has a valid key.
    await pool.query("UPDATE api_keys SET last_active=NOW() WHERE id=$1", [id]);
    if (rows[0].project_id) {
      return { project_id: rows[0].project_id };
    }
    if (rows[0].account_id) {
      return { account_id: rows[0].account_id };
    }
  }
  return undefined;
}
