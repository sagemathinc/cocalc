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
import isAccountAvailable from "@cocalc/server/auth/is-account-available";
import isDomainExclusiveSSO from "@cocalc/server/auth/is-domain-exclusive-sso";
import createAccount from "@cocalc/server/accounts/create-account";
import { getAccount, signUserIn } from "./sign-in";
import sendWelcomeEmail from "@cocalc/server/email/welcome-email";
import redeemRegistrationToken from "@cocalc/server/auth/tokens/redeem";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import isPost from "lib/api/is-post";
import reCaptcha from "@cocalc/server/auth/recaptcha";

interface Issues {
  terms?: string;
  email?: string;
  password?: string;
}

export default async function signUp(req, res) {
  if (!isPost(req, res)) return;

  let {
    terms,
    email,
    password,
    firstName,
    lastName,
    registrationToken,
  } = req.body;

  password = (password ?? "").trim();
  email = (email ?? "").toLowerCase().trim();
  firstName = (firstName ? firstName : "Anonymous").trim();
  lastName = (
    lastName ? lastName : `User-${Math.round(new Date().valueOf() / 1000)}`
  ).trim();
  registrationToken = (registrationToken ?? "").trim();

  // if email is empty, then trying to create an anonymous account,
  // which may be allowed, depending on server settings.
  const isAnonymous = !email;

  if (!isAnonymous && email && password) {
    // Maybe there is already an account with this email and password?
    try {
      const account_id = await getAccount(email, password);
      await signUserIn(req, res, account_id);
      return;
    } catch (_err) {
      // fine -- just means they don't already have an account.
    }
  }

  if (!isAnonymous) {
    const issues = checkObviousConditions({ terms, email, password });
    if (len(issues) > 0) {
      res.json({ issues });
      return;
    }
  }

  // The UI doesn't let users try to make an account via signUp if
  // email isn't enabled.  However, they might try to directly POST
  // to the API, so we check here as well.
  const { email_signup, anonymous_signup } = await getServerSettings();

  try {
    await reCaptcha(req);
  } catch (err) {
    res.json({
      issues: {
        reCaptcha: err.message,
      },
    });
    return;
  }

  if (isAnonymous) {
    // Check anonymous sign up conditions.
    if (!anonymous_signup) {
      res.json({
        issues: {
          email: "Anonymous account creation is disabled.",
        },
      });
      return;
    }
  } else {
    // Check the email sign up conditions.
    if (!email_signup) {
      res.json({
        issues: {
          email: "Email account creation is disabled.",
        },
      });
      return;
    }
    const exclusive = await isDomainExclusiveSSO(email);
    if (exclusive) {
      res.json({
        issues: {
          email: `To sign up with "@${exclusive}", you have to use the corresponding single sign on mechanism.  Delete your email address above, then click the SSO icon.`,
        },
      });
      return;
    }

    if (!(await isAccountAvailable(email))) {
      res.json({
        issues: { email: `Email address "${email}" already in use.` },
      });
      return;
    }
  }

  try {
    await redeemRegistrationToken(registrationToken);
  } catch (err) {
    res.json({
      issues: {
        registrationToken: `Issue with registration token -- ${err.message}`,
      },
    });
    return;
  }

  try {
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
        await sendWelcomeEmail(email, account_id);
      } catch (err) {
        // Expected to fail, e.g., when sendgrid or smtp not configured yet.
        // TODO: should log using debug instead of console?
        console.log(`WARNING: failed to send welcome email to ${email}`, err);
      }
    }

    await signUserIn(req, res, account_id); // sets a cookie
    res.json({ account_id });
  } catch (err) {
    res.json({ error: err.message });
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
