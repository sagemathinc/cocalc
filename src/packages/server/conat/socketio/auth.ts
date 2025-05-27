import { inboxPrefix } from "@cocalc/conat/names";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { getAccountIdFromRememberMe } from "@cocalc/server/auth/get-account";
import { parse } from "cookie";
import { getRememberMeHashFromCookieValue } from "@cocalc/server/auth/remember-me";
import LRU from "lru-cache";
import { conatPassword } from "@cocalc/backend/data";
import {
  API_COOKIE_NAME,
  HUB_PASSWORD_COOKIE_NAME,
  PROJECT_SECRET_COOKIE_NAME,
  PROJECT_ID_COOKIE_NAME,
  REMEMBER_ME_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";
import { getAccountWithApiKey } from "@cocalc/server/api/manage";
import getPool from "@cocalc/database/pool";

export async function getUser(socket): Promise<CoCalcUser> {
  if (!socket.handshake.headers.cookie) {
    throw Error("you must set authentication cookies");
  }
  const cookies = parse(socket.handshake.headers.cookie);
  if (cookies[HUB_PASSWORD_COOKIE_NAME] == conatPassword) {
    return { hub_id: "hub" };
  }
  if (cookies[API_COOKIE_NAME]) {
    // project or compute server or account
    const user = await getAccountWithApiKey(cookies[API_COOKIE_NAME]!);
    if (!user) {
      throw Error("api key no longer valid");
    }
    return user;
  }
  if (cookies[PROJECT_SECRET_COOKIE_NAME]) {
    const project_id = cookies[PROJECT_ID_COOKIE_NAME];
    if (!project_id) {
      throw Error(
        `must specify project_id in the cookie ${PROJECT_ID_COOKIE_NAME}`,
      );
    }
    const secret = cookies[PROJECT_SECRET_COOKIE_NAME];
    if ((await getProjectSecretToken(project_id)) == secret) {
      return { project_id };
    } else {
      throw Error(`invalid secret token for project`);
    }
  }

  const value = cookies[REMEMBER_ME_COOKIE_NAME];
  if (!value) {
    throw Error(
      `must set one of the following cookies: '${REMEMBER_ME_COOKIE_NAME}' or 'Hub-Password'`,
    );
  }
  const hash = getRememberMeHashFromCookieValue(value);
  if (!hash) {
    throw Error("invalid remember me cookie");
  }
  const account_id = await getAccountIdFromRememberMe(hash);
  if (!account_id) {
    throw Error("remember me cookie expired");
  }
  return { account_id };
}

async function getProjectSecretToken(project_id): Promise<string | undefined> {
  const pool = getPool();
  const { rows } = await pool.query(
    "select status#>'{secret_token}' as secret_token from projects where project_id=$1",
    [project_id],
  );
  return rows[0]?.secret_token;
}

const isAllowedCache = new LRU<string, boolean>({
  max: 10000,
  ttl: 1000 * 60, // 1 minute
});

export async function isAllowed({
  user,
  subject,
  type,
}: {
  user?: CoCalcUser | null;
  subject: string;
  type: "sub" | "pub";
}): Promise<boolean> {
  if (user == null || user?.error) {
    // non-authenticated user -- allow NOTHING
    return false;
  }
  const userType = getCoCalcUserType(user);
  if (userType == "hub") {
    // right now hubs have full permissions.
    return true;
  }
  const userId = getCoCalcUserId(user);
  const key = `${userType}-${userId}-${subject}-${type}`;
  if (isAllowedCache.has(key)) {
    return isAllowedCache.get(key)!;
  }

  const common = checkCommonPermissions({
    userId,
    userType,
    user,
    subject,
    type,
  });
  let allowed;
  if (common != null) {
    allowed = common;
  } else if (userType == "project") {
    allowed = isProjectAllowed({ project_id: userId, subject, type });
  } else if (userType == "account") {
    allowed = await isAccountAllowed({ account_id: userId, subject, type });
  } else {
    allowed = false;
  }
  isAllowedCache.set(key, allowed);
  return allowed;
}

export function checkCommonPermissions({
  user,
  userType,
  userId,
  subject,
  type,
}: {
  user: CoCalcUser;
  userType: "account" | "project";
  userId: string;
  subject: string;
  type: "sub" | "pub";
}): null | boolean {
  // can publish as *this user* to the hub's api's
  if (subject.startsWith(`hub.${userType}.${userId}.`)) {
    return type == "pub";
  }

  // everyone can publish to all inboxes.  This seems like a major
  //  security risk, but with request/reply, the reply subject under
  // _INBOX is a long random code that is only known for a moment
  // by the sender and the service, so it is NOT a security risk.
  if (type == "pub" && subject.startsWith("_INBOX.")) {
    return true;
  }
  // custom inbox only for this user -- important for security, so we
  // can only listen to messages for us, and not for anybody else.
  if (type == "sub" && subject.startsWith(inboxPrefix(user))) {
    return true;
  }

  if (type == "sub" && subject.startsWith("public.")) {
    return true;
  }

  // no decision yet
  return null;
}

function isProjectAllowed({
  project_id,
  subject,
}: {
  project_id: string;
  subject: string;
  type: "sub" | "pub";
}): boolean {
  // pub and sub are the same

  if (subject.startsWith(`project.${project_id}.`)) {
    return true;
  }
  // *.project-${project_id}.>
  if (subject.split(".")[1] == `project-${project_id}`) {
    return true;
  }

  return false;
}

async function isAccountAllowed({
  account_id,
  subject,
}: {
  account_id: string;
  subject: string;
  type: "sub" | "pub";
}): Promise<boolean> {
  // pub and sub are the same
  if (subject.startsWith(`account.${account_id}.`)) {
    return true;
  }
  // *.account-${account_id}.>
  if (subject.split(".")[1] == `account-${account_id}`) {
    return true;
  }

  // account accessing a project
  const project_id = extractProjectSubject(subject);
  if (!project_id) {
    return false;
  }
  return await isCollaborator({ account_id, project_id });
}

function extractProjectSubject(subject: string): string {
  if (subject.startsWith("project.")) {
    const project_id = subject.split(".")[1];
    if (isValidUUID(project_id)) {
      return project_id;
    }
    return "";
  }
  const v = subject.split(".");
  if (v[1]?.startsWith("project-")) {
    const project_id = v[1].slice("project-".length);
    if (isValidUUID(project_id)) {
      return project_id;
    }
  }
  return "";
}

// A CoCalc User is (so far): a project or account or a hub
export type CoCalcUser =
  | {
      account_id: string;
      project_id?: string;
      hub_id?: string;
      error?: string;
    }
  | {
      account_id?: string;
      project_id?: string;
      hub_id: string;
      error?: string;
    }
  | {
      account_id?: string;
      project_id: string;
      hub_id?: string;
      error?: string;
    }
  | {
      account_id?: string;
      project_id?: string;
      hub_id?: string;
      error: string;
    };

export function getCoCalcUserType({
  account_id,
  project_id,
  hub_id,
}: CoCalcUser): "account" | "project" | "hub" {
  if (account_id) {
    if (project_id || hub_id) {
      throw Error(
        "exactly one of account_id or project_id or hub_id must be specified",
      );
    }
    return "account";
  }
  if (project_id) {
    if (hub_id) {
      throw Error(
        "exactly one of account_id or project_id or hub_id must be specified",
      );
    }
    return "project";
  }
  if (hub_id) {
    return "hub";
  }
  throw Error("account_id or project_id or hub_id must be specified in User");
}

export function getCoCalcUserId({
  account_id,
  project_id,
  hub_id,
}: CoCalcUser): string {
  if (account_id) {
    if (project_id || hub_id) {
      throw Error(
        "exactly one of account_id or project_id or hub_id must be specified",
      );
    }
    return account_id;
  }
  if (project_id) {
    if (hub_id) {
      throw Error(
        "exactly one of account_id or project_id or hub_id must be specified",
      );
    }
    return project_id;
  }
  if (hub_id) {
    return hub_id;
  }
  throw Error("account_id or project_id or hub_id must be specified");
}
