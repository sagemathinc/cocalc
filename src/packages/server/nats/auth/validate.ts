import getPool from "@cocalc/database/pool";
import { getAccountWithApiKey } from "@cocalc/server/api/manage";
import { subsetCollaboratorMulti } from "@cocalc/server/projects/is-collaborator";
import { getAccountIdFromRememberMe } from "@cocalc/server/auth/get-account";
import { getRememberMeHashFromCookieValue } from "@cocalc/server/auth/remember-me";

// if throw error or not return true, then validation fails.
// success = NOT throwing error and returning true.

export async function validate({
  account_id,
  project_id,
  requested_project_ids,
  auth_token,
}: {
  account_id?: string;
  project_id?: string;
  requested_project_ids?: string[];
  auth_token?: string;
}): Promise<{ project_ids?: string[] }> {
  if (account_id && project_id) {
    throw Error("exactly one of account_id and project_id must be specified");
  }
  if (!auth_token) {
    throw Error("auth_token must be specified");
  }

  // are they who they say they are?
  await assertValidUser({ account_id, project_id, auth_token });

  // we now know that auth_token provides they are either project_id or account_id.
  // what about requested_project_ids?
  if (
    !requested_project_ids ||
    requested_project_ids.length == 0 ||
    project_id
  ) {
    // none requested or is a project
    return {};
  }

  if (!account_id) {
    throw Error("bug");
  }
  const project_ids = await subsetCollaboratorMulti({
    account_id,
    project_ids: requested_project_ids,
  });
  return { project_ids };
}

async function assertValidUser({ auth_token, project_id, account_id }) {
  if (auth_token?.startsWith("sk-") || auth_token?.startsWith("sk_")) {
    // auth_token is presumably an api key
    const a = await getAccountWithApiKey(auth_token);
    if (project_id && a?.project_id == project_id) {
      return;
    } else if (account_id && a?.account_id == account_id) {
      return;
    }
    throw Error(
      `auth_token valid for ${JSON.stringify(a)} by does not match ${project_id} or ${account_id}`,
    );
  }
  if (project_id) {
    if ((await getProjectSecretToken(project_id)) == auth_token) {
      return;
    }
  }
  if (account_id) {
    // maybe auth_token is a valid remember me browser cookie?
    const hash = getRememberMeHashFromCookieValue(auth_token);
    if (hash && account_id == (await getAccountIdFromRememberMe(hash))) {
      return;
    }
  }
  // nothing above matches, so FAIL!
  throw Error("invalid auth_token");
}

async function getProjectSecretToken(project_id): Promise<string | undefined> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select status#>'{secret_token}' as secret_token from projects where project_id=$1",
    [project_id],
  );
  return rows[0]?.secret_token;
}
