/* Sign in using an impersonation auth_token. */

import getPool from "@cocalc/database/pool";
import { createRememberMeCookie } from "@cocalc/server/auth/remember-me";
import Cookies from "cookies";
import { REMEMBER_ME_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import clientSideRedirect from "@cocalc/server/auth/client-side-redirect";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import base_path from "@cocalc/backend/base-path";

export async function signInUsingImpersonateToken({ req, res }) {
  try {
    await doIt({ req, res });
  } catch (err) {
    res.send(`ERROR: impersonate error -- ${err}`);
  }
}

async function doIt({ req, res }) {
  const { auth_token } = req.query;
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
  cookies.set(REMEMBER_ME_COOKIE_NAME, value, {
    maxAge: ttl_s * 1000,
    sameSite: "strict",
  });

  const { dns } = await getServerSettings();
  const target = `https://${dns}${base_path}`;

  clientSideRedirect({ res, target });
}
