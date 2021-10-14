/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Sign up for a new account:

0. If email/password matches an existing account, just sign them in.  Reduces confusion.
1. Reject if password is absurdly weak.
2. Query the database to make sure the email address is not already taken.
3. Generate a random account_id. Do not check it is not already taken, since that's
   highly unlikely, and the insert in 4 would fail anyways.
4. Write account to the database.
5. Sign user in
*/

import {
  len,
  is_valid_email_address as isValidEmailAddress,
} from "@cocalc/util/misc";
import { v4 } from "uuid";
import isAccountAvailable from "@cocalc/backend/auth/is-account-available";
import createAccount from "@cocalc/backend/auth/create-account";
import { getAccount, signUserIn } from "./sign-in";
import sendWelcomeEmail from "@cocalc/backend/email/welcome-email";

interface Issues {
  terms?: string;
  email?: string;
  password?: string;
}

export default async function signUp(req, res) {
  if (req.method === "POST") {
    const { email, password, firstName, lastName } = req.body;

    try {
      const account_id = await getAccount(email, password);
      await signUserIn(req, res, account_id);
      return;
    } catch (_err) {
      // fine -- just means they don't already have an account.
    }

    const issues = checkObviousConditions(req.body);
    if (len(issues) > 0) {
      res.json({ issues });
      return;
    }

    if (!(await isAccountAvailable(email))) {
      res.json({
        issues: { email: `Email address "${email}" already in use.` },
      });
      return;
    }

    const account_id = v4();
    await createAccount({
      email,
      password,
      firstName,
      lastName,
      account_id,
    });

    if (email) {
      try {
        await sendWelcomeEmail(email);
      } catch (err) {
        // Expected to fail, e.g., when sendgrid or smtp not configured yet.
        // TODO: should log using debug instead of console?
        console.log(`WARNING: failed to send welcome email to ${email}`, err);
      }
    }

    await signUserIn(req, res, account_id);
    return;
  } else {
    res.status(404).json({ message: "Sign In must use a POST request." });
  }
}

function checkObviousConditions({ terms, email, password }): Issues {
  const issues: Issues = {};
  if (!terms) {
    issues.terms = "You must agree to the terms of usage.";
  }
  if (!email || !isValidEmailAddress(email)) {
    issues.email = "You must provide a valid email address.";
  }
  if (!password || password.length < 6) {
    issues.password = "Your password must not be trivial to guess.";
  }
  return issues;
}
