/*
User management of the v1 API key associated to an account.
This supports three actions:

- get: get the existing key associated to an account; return undefined if there is no api key set.
- delete: delete the existing key associated to an account
- regenerate: delete the existing key and replace it by a new random key.

If the user has a password, then it must be provided and be correct. If
they have no password, then the provided one is ignored.
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import isPasswordCorrect from "@cocalc/server/auth/is-password-correct";
import hasPassword from "@cocalc/server/auth/has-password";
import { generate } from "random-key";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import passwordHash, {
  verifyPassword,
} from "@cocalc/backend/auth/password-hash";
import type { ApiKeyInfo } from "@cocalc/util/db-schema/projects";
import { getLogger } from "@cocalc/backend/logger";

const log = getLogger("server:api:manage");

const MAX_PROJECT_KEYS = 25;

type Action = "get" | "delete" | "regenerate" | "edit";

interface Options {
  account_id: string;
  password?: string;
  action: Action;
  project_id?: string;
  trunc?: string;
  name?: string;
}

export default async function manage({
  account_id,
  password,
  action,
  project_id,
  trunc,
  name,
}: Options): Promise<string | ApiKeyInfo[] | undefined> {
  log.debug("manage", { account_id, action, trunc, name, project_id });
  if (!isValidUUID) {
    throw Error("account_id is not a valid uuid");
  }

  if (project_id == null && (await hasPassword(account_id))) {
    // Check if the user has a password
    if (!password) {
      throw Error("password must be provided");
    }
    // verify password is correct
    if (!(await isPasswordCorrect({ account_id, password }))) {
      throw Error("invalid password");
    }
  }
  // Now we allow the action.
  if (project_id != null) {
    if (!(await isCollaborator({ account_id, project_id }))) {
      throw Error("user must be collaborator on project");
    }
    return await manageProjectApiKey({ action, project_id, trunc, name });
  }

  const pool = getPool();
  switch (action) {
    case "get":
      const { rows } = await pool.query(
        "SELECT api_key FROM accounts WHERE account_id=$1::UUID",
        [account_id]
      );
      if (rows.length == 0) {
        throw Error("no such account");
      }
      return rows[0].api_key;
    case "delete":
      await pool.query(
        "UPDATE accounts SET api_key=NULL WHERE account_id=$1::UUID",
        [account_id]
      );
      return;
    case "regenerate":
      // There is a unique index on api_key, so there is a small probability
      // that this query fails.  However, it's probably smaller than the probability
      // that the database connection is broken, so if it were to ever happen, then
      // the user could just retry.  For context, for the last few years, this query
      // happened on cocalc.com only a few thousand times *total*.
      const api_key = `sk_${generate()}`;
      await pool.query(
        "UPDATE accounts SET api_key=$1 WHERE account_id=$2::UUID",
        [api_key, account_id]
      );
      return api_key;
    default:
      throw Error(`unknown action="${action}"`);
  }
}

export async function getProjectApiKeys(
  project_id: string,
  cache?
): Promise<ApiKeyInfo[]> {
  log.debug("getProjectApiKeys", project_id);
  const pool = getPool(cache);
  const { rows } = await pool.query(
    "SELECT api_keys FROM projects WHERE project_id=$1::UUID",
    [project_id]
  );
  if (rows.length == 0) {
    throw Error("no such project");
  }
  return rows[0].api_keys ?? [];
}

async function setProjectApiKeys(project_id: string, api_keys: ApiKeyInfo[]) {
  log.debug("setProjectApiKeys", project_id);
  const pool = getPool();
  await pool.query(
    "UPDATE projects SET api_keys=$1 WHERE project_id=$2::UUID",
    [api_keys, project_id]
  );
}

//api_key.slice(0, 3) + "..." + api_key.slice(-4)
// This function does no auth checks.
async function manageProjectApiKey({
  action,
  project_id,
  trunc,
  name,
}): Promise<ApiKeyInfo[] | string | undefined> {
  const api_keys = await getProjectApiKeys(project_id);
  switch (action) {
    case "get":
      return api_keys.map(({ name, trunc, used }) => {
        return { name, trunc, used };
      });

    case "delete":
      // delete key with given trunc
      const api_keys2 = api_keys.filter((x) => x.trunc != trunc);
      if (api_keys2.length == api_keys.length) {
        throw Error(`no key ${trunc}`);
      }
      await setProjectApiKeys(project_id, api_keys2);
      break;

    case "regenerate": // should be called "create"
      // creates a key with given name (if given)
      if (api_keys.length >= MAX_PROJECT_KEYS) {
        throw Error(
          `you can have at most ${MAX_PROJECT_KEYS} api keys per project`
        );
      }
      const key = `sk_${generate(48)}`;
      const api_key = {
        name: name ?? "",
        trunc: key.slice(0, 3) + "..." + key.slice(-4),
        hash: passwordHash(key),
      };
      api_keys.push(api_key);
      await setProjectApiKeys(project_id, api_keys);
      return key;

    case "edit": // change the name
      if (!name) {
        throw Error("must provide the new name");
      }
      if (!trunc) {
        throw Error("must provide trunc so we know which key to change");
      }
      for (const key of api_keys) {
        if (key.trunc == trunc) {
          key.name = name;
          await setProjectApiKeys(project_id, api_keys);
          return;
        }
      }
      break;
  }
}

/*
Get the account that has the given api key, or returns undefined
if there is no such account.

If the api_key is not an account wide key and the project_id argument
is given, return the project_id if the key is a valid key for that
project and record the access.
*/
export async function getAccountWithApiKey(
  api_key: string,
  project_id?: string
): Promise<string | undefined> {
  log.debug("getAccountWithApiKey", { project_id });
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE api_key = $1::TEXT",
    [api_key]
  );
  if (rows.length > 0) {
    const account_id = rows[0].account_id;
    // it's a valid account api key
    log.debug("getAccountWithApiKey: valid api key for ", account_id);
    return account_id;
  }
  if (project_id == null) {
    // not a valid account_id key, and no project specified.
    return undefined;
  }
  // maybe it's a project api key?
  const api_keys = await getProjectApiKeys(project_id, "medium");
  for (const k of api_keys) {
    if (verifyPassword(api_key, k.hash)) {
      k.used = Date.now();
      (async () => {
        try {
          await setProjectApiKeys(project_id, api_keys);
        } catch (_) {}
      })();
      // confirmed!
      return project_id;
    }
  }
  return undefined;
}
