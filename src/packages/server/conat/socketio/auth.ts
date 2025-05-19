import { inboxPrefix } from "@cocalc/conat/names";
import {
  getCoCalcUserType,
  getCoCalcUserId,
  type CoCalcUser,
} from "@cocalc/server/conat/auth/permissions";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { getAccountIdFromRememberMe } from "@cocalc/server/auth/get-account";
import { parse } from "cookie";
import { REMEMBER_ME_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { getRememberMeHashFromCookieValue } from "@cocalc/server/auth/remember-me";

// [ ] TODO -- api keys, hubs,
export async function getUser(socket): Promise<CoCalcUser | null> {
  if (!socket.handshake.headers.cookie) {
    return null;
  }
  const cookies = parse(socket.handshake.headers.cookie);
  const value = cookies[REMEMBER_ME_COOKIE_NAME];
  if (!value) {
    return null;
  }
  const hash = getRememberMeHashFromCookieValue(value);
  if (!hash) {
    return null;
  }
  const account_id = await getAccountIdFromRememberMe(hash);
  return { account_id };
}

export async function isAllowed({
  user,
  subject,
  type,
}: {
  user?: CoCalcUser;
  subject: string;
  type: "sub" | "pub";
}) {
  if (user == null) {
    // TODO: temporarily allowing everything for non-authenticated user for dev only
    return true;
  }
  const userId = getCoCalcUserId(user);
  const userType = getCoCalcUserType(user);

  const common = checkCommonPermissions({
    userId,
    userType,
    user,
    subject,
    type,
  });
  if (common != null) {
    return common;
  }
  if (userType == "project") {
    return await isProjectAllowed({ project_id: userId, subject, type });
  } else if (userType == "account") {
    return await isAccountAllowed({ account_id: userId, subject, type });
  }
  return false;
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
