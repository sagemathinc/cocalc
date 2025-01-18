/* Sign in using an impersonation auth_token. */

import Cookies from "cookies";

import { REMEMBER_ME_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import base_path from "@cocalc/backend/base-path";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import clientSideRedirect from "@cocalc/server/auth/client-side-redirect";
import { createRememberMeCookie } from "@cocalc/server/auth/remember-me";
import { isLocale } from "@cocalc/util/i18n/const";
import { join } from "path";

export async function signInUsingImpersonateToken({ req, res }) {
  try {
    await doIt({ req, res });
  } catch (err) {
    res.send(`ERROR: impersonate error -- ${err}`);
  }
}

async function doIt({ req, res }) {
  const { auth_token, lang_temp } = req.query;
  if (!auth_token) {
    throw Error("invalid empty token");
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id FROM auth_tokens WHERE auth_token=$1 AND expire > NOW()",
    [auth_token],
  );
  if (rows.length == 0) {
    throw Error(`unknown or expired token: '${auth_token}'`);
  }
  const { account_id } = rows[0];

  const { value, ttl_s } = await createRememberMeCookie(account_id, 12 * 3600);
  const cookies = new Cookies(req, res);
  const { samesite_remember_me } = await getServerSettings();
  cookies.set(REMEMBER_ME_COOKIE_NAME, value, {
    maxAge: ttl_s * 1000,
    sameSite: samesite_remember_me,
  });

  const { dns } = await getServerSettings();
  let target = `https://${dns}${join(base_path, "app")}`;

  // if lang_temp is a locale, then append it as a query parameter.
  // This is usally "en" to help admins understanding the UI without changing the user's language preferences.
  if (isLocale(lang_temp)) {
    target += `?lang_temp=${encodeURIComponent(lang_temp)}`;
  }

  clientSideRedirect({ res, target });
}
