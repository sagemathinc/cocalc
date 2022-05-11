/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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

import { verify } from "password-hash";
import getPool from "@cocalc/database/pool";
import {
  createRememberMeCookie,
  COOKIE_NAME,
} from "@cocalc/server/auth/remember-me";
import { signInCheck, recordFail } from "@cocalc/server/auth/throttle";
import Cookies from "cookies";
import isPost from "lib/api/is-post";
// import reCaptcha from "@cocalc/server/auth/recaptcha";

export default async function signIn(req, res) {
  if (!isPost(req, res)) return;

  let { email, password } = req.body;
  email = email.toLowerCase().trim();
  const check = signInCheck(email, req.ip);
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
  password: string
): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, password_hash FROM accounts WHERE email_address=$1",
    [email_address]
  );
  if (rows.length == 0) {
    throw Error(`no account with email address '${email_address}'`);
  }
  const { account_id, password_hash } = rows[0];
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
    const cookies = new Cookies(req, res, { maxAge: ttl_s * 1000 });
    cookies.set(COOKIE_NAME, value);
  } catch (err) {
    res.json({ error: `Problem setting cookie -- ${err.message}.` });
    return;
  }
  res.json({ account_id });
}
