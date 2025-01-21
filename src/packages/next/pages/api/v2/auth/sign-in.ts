/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sign in works as follows:

1. Query the database for the account_id and password_hash
   with the given username.

2. Use the password-hash library to determine whether or
   not the given password hashes properly.  If so, create and
   set a secure remember_me http cookie confirming that the
   client is that user and tell user they are now authenticated.
   If not, send an error back.
*/

import getPool from "@cocalc/database/pool";
import { createRememberMeCookie } from "@cocalc/server/auth/remember-me";
import {
  NATS_JWT_COOKIE_NAME,
  REMEMBER_ME_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";
import { recordFail, signInCheck } from "@cocalc/server/auth/throttle";
import Cookies from "cookies";
import getParams from "lib/api/get-params";
import { verify } from "password-hash";
import { Request, Response } from "express";
// import reCaptcha from "@cocalc/server/auth/recaptcha";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

export default async function signIn(req: Request, res: Response) {
  let { email, password } = getParams(req);
  email = email.toLowerCase().trim();
  const check: string | undefined = await signInCheck(email, req.ip);
  if (check) {
    res.json({ error: check });
    return;
  }
  let account_id: string;

  try {
    // Don't bother checking reCaptcha for *sign in* for now, since it causes trouble
    // when large classes all sign in from one point.  Also, it's much less important
    // for sign in, than for sign up and payment.
    // await reCaptcha(req);
    account_id = await getAccount(email, password);
  } catch (err) {
    res.json({ error: `Problem signing into account -- ${err.message}.` });
    recordFail(email, req.ip);
    return;
  }

  await signUserIn(req, res, account_id);
}

export async function getAccount(
  email_address: string,
  password: string,
): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, password_hash, banned FROM accounts WHERE email_address=$1",
    [email_address],
  );
  if (rows.length == 0) {
    throw Error(`no account with email address '${email_address}'`);
  }
  const { account_id, password_hash, banned } = rows[0];
  if (banned) {
    throw Error(
      `'${email_address}' is banned -- if you think this is a mistake, please email help@cocalc.com and explain.`,
    );
  }
  if (!verify(password, password_hash)) {
    throw Error(`password for '${email_address}' is incorrect`);
  }
  return account_id;
}

export async function signUserIn(req, res, account_id: string): Promise<void> {
  let value, ttl_s;
  try {
    ({ value, ttl_s } = await createRememberMeCookie(account_id));
  } catch (err) {
    res.json({ error: `Problem creating session cookie -- ${err.message}.` });
    return;
  }
  try {
    const { samesite_remember_me } = await getServerSettings();
    const cookies = new Cookies(req, res, { secure: true });
    cookies.set(REMEMBER_ME_COOKIE_NAME, value, {
      maxAge: ttl_s * 1000,
      sameSite: samesite_remember_me,
    });
    // ensure there is no stale JWT cookie
    res.clearCookie(NATS_JWT_COOKIE_NAME);
  } catch (err) {
    res.json({ error: `Problem setting cookie -- ${err.message}.` });
    return;
  }
  res.json({ account_id });
}
