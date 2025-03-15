import {
  ACCOUNT_ID_COOKIE_NAME,
  REMEMBER_ME_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";
import { createRememberMeCookie } from "@cocalc/server/auth/remember-me";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import Cookies from "cookies";

// 6 months by default, but sometimes (e.g., impersonate) is MUCH shorter.
export const DEFAULT_MAX_AGE_MS = 24 * 3600 * 30 * 1000 * 6;

export default async function setSignInCookies({
  req,
  res,
  account_id,
  maxAge = DEFAULT_MAX_AGE_MS,
}: {
  req;
  res;
  account_id: string;
  maxAge?: number;
}) {
  const opts = { req, res, account_id, maxAge };
  await Promise.all([setRememberMeCookie(opts), setAccountIdCookie(opts)]);
}

async function setRememberMeCookie({ req, res, account_id, maxAge }) {
  const { value } = await createRememberMeCookie(account_id, maxAge / 1000);
  const cookies = new Cookies(req, res);
  const { samesite_remember_me } = await getServerSettings();
  cookies.set(REMEMBER_ME_COOKIE_NAME, value, {
    maxAge,
    sameSite: samesite_remember_me,
  });
}

async function setAccountIdCookie({ req, res, account_id, maxAge }) {
  // account_id cookie is NOT secure since user is supposed to read it
  // from browser.  It's not for telling the server the account_id, but
  // for telling the user their own account_id.
  const cookies = new Cookies(req, res, { secure: false, httpOnly: false });
  cookies.set(ACCOUNT_ID_COOKIE_NAME, account_id, {
    maxAge,
    httpOnly: false,
  });
}
