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
import getPool from "@cocalc/util-node/database";

export default async function signIn(req, res) {
  if (req.method === "POST") {
    const { email, password } = req.body;
    let account_id: string;
    try {
      account_id = await getAccount(email, password);
    } catch (err) {
      res.json({ error: `${err}` });
    }
    res.json({ account_id });
  } else {
    res.status(404).json({ message: "Sign In must use a POST request." });
  }
}

function getAccoint(email_address: string, password: string): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id, password_hash FROM accounts WHERE email_address=$1",
    [email]
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
