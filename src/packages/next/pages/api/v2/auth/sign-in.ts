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
import { Request, Response } from "express";

import getPool from "@cocalc/database/pool";
import { recordFail, signInCheck } from "@cocalc/server/auth/throttle";
import getParams from "lib/api/get-params";
import { verify } from "password-hash";
import { MAX_PASSWORD_LENGTH } from "@cocalc/util/auth";
import setSignInCookies from "@cocalc/server/auth/set-sign-in-cookies";

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
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `The password must be shorter than ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }

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
  try {
    await setSignInCookies({
      req,
      res,
      account_id,
    });
  } catch (err) {
    res.json({ error: `Problem setting auth cookies -- ${err}` });
    return;
  }
  res.json({ account_id });
}
