import getCustomize from "@cocalc/database/settings/customize";
export { getCustomize };
import { record_user_tracking } from "@cocalc/database/postgres/user-tracking";
import { db } from "@cocalc/database";
import manageApiKeys from "@cocalc/server/api/manage";
export { manageApiKeys };
import { type UserSearchResult } from "@cocalc/util/db-schema/accounts";
import isAdmin from "@cocalc/server/accounts/is-admin";
import search from "@cocalc/server/accounts/search";
export { getNames } from "@cocalc/server/accounts/get-name";
import { callback2 } from "@cocalc/util/async-utils";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const logger = getLogger("server:conat:api:system");

export function ping() {
  return { now: Date.now() };
}

export async function terminate() {}

export async function userTracking({
  event,
  value,
  account_id,
}: {
  event: string;
  value: object;
  account_id?: string;
}): Promise<void> {
  await record_user_tracking(db(), account_id!, event, value);
}

export async function logClientError({
  account_id,
  event,
  error,
}: {
  account_id?: string;
  event: string;
  error: string;
}): Promise<void> {
  await callback2(db().log_client_error, {
    event,
    error,
    account_id,
  });
}

export async function webappError(opts: object): Promise<void> {
  await callback2(db().webapp_error, opts);
}

export {
  generateUserAuthToken,
  revokeUserAuthToken,
} from "@cocalc/server/auth/auth-token";

export async function userSearch({
  account_id,
  query,
  limit,
  admin,
  only_email,
}: {
  account_id?: string;
  query: string;
  limit?: number;
  admin?: boolean;
  only_email?: boolean;
}): Promise<UserSearchResult[]> {
  if (!account_id) {
    throw Error("You must be signed in to search for users.");
  }
  if (admin) {
    if (!(await isAdmin(account_id))) {
      throw Error("Must be an admin to do admin search.");
    }
  } else {
    if (limit != null && limit > 50) {
      // hard cap at 50... (for non-admin)
      limit = 50;
    }
  }
  return await search({ query, limit, admin, only_email });
}

import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import { createReset } from "@cocalc/server/auth/password-reset";
export async function adminResetPasswordLink({
  account_id,
  user_account_id,
}: {
  account_id?: string;
  user_account_id: string;
}): Promise<string> {
  if (!account_id || !(await isAdmin(account_id))) {
    throw Error("must be an admin");
  }
  const email = await getEmailAddress(user_account_id);
  if (!email) {
    throw Error("passwords are only defined for accounts with email");
  }
  const id = await createReset(email, "", 60 * 60 * 24); // 24 hour ttl seems reasonable for this.
  return `/auth/password-reset/${id}`;
}

import sendEmailVerification0 from "@cocalc/server/accounts/send-email-verification";

export async function sendEmailVerification({
  account_id,
  only_verify,
}: {
  account_id?: string;
  only_verify?: boolean;
}): Promise<void> {
  if (!account_id) {
    throw Error("must be signed in");
  }
  const resp = await sendEmailVerification0(account_id, only_verify);
  if (resp) {
    throw Error(resp);
  }
}

import { delete_passport } from "@cocalc/server/auth/sso/delete-passport";
export async function deletePassport(opts: {
  account_id: string;
  strategy: string;
  id: string;
}): Promise<void> {
  await delete_passport(db(), opts);
}

import { sync as salesloftSync } from "@cocalc/server/salesloft/sync";
export async function adminSalesloftSync({
  account_id,
  account_ids,
}: {
  account_id?: string;
  account_ids: string[];
}) {
  if (!account_id || !(await isAdmin(account_id))) {
    throw Error("must be an admin");
  }
  (async () => {
    // we do not block on this
    try {
      await salesloftSync(account_ids);
    } catch (err) {
      logger.debug(`WARNING: issue syncing with salesloft -- ${err}`, {
        account_ids,
      });
    }
  })();
}

// user can sync themself with salesloft.
export const userSalesloftSync = reuseInFlight(
  async ({ account_id }: { account_id?: string }): Promise<void> => {
    if (account_id) {
      await salesloftSync([account_id]);
    }
  },
);
