/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Password reset works as follows:

1. Query the database to make sure there is a user with the given email address.

TODO
*/

export default async function signIn() {}

/*
import { verify } from "password-hash";
import getPool from "@cocalc/util-node/database";
import {
  createRememberMeCookie,
  COOKIE_NAME,
} from "@cocalc/util-node/auth/remember-me";
import { signInCheck, recordFail } from "@cocalc/util-node/auth/throttle";
import Cookies from "cookies";

export default async function signIn(req, res) {
  if (req.method === "POST") {
    const { email, password } = req.body;
    const check = signInCheck(email, req.ip);
    if (check) {
      res.json({ error: check });
      return;
    }
    let account_id: string;
    try {
      account_id = await getAccount(email, password);
    } catch (err) {
      res.json({ error: `Problem signing into account -- ${err}.` });
      recordFail(email, req.ip);
      return;
    }
    let value, ttl_s;
    try {
      ({ value, ttl_s } = await createRememberMeCookie(account_id));
    } catch (err) {
      res.json({ error: `Problem creating session cookie -- ${err}.` });
      return;
    }
    try {
      const cookies = new Cookies(req, res, { maxAge: ttl_s * 1000 });
      cookies.set(COOKIE_NAME, value);
    } catch (err) {
      res.json({ error: `Problem setting cookie -- ${err}.` });
      return;
    }
    res.json({ account_id });
  } else {
    res.status(404).json({ message: "Sign In must use a POST request." });
  }
}
*/