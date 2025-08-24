/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sign up for a new account:

0. If email/password matches an existing account, just sign them in.  Reduces confusion.
1. Reject if password is absurdly weak.
2. Query the database to make sure the email address is not already taken.
3. Generate a random account_id. Do not check it is not already taken, since that's
   highly unlikely, and the insert in 4 would fail anyways.
4. Write account to the database.
5. Sign user in (if not being used via the API).

This can also be used via the API, but the client must have a minimum balance
of at least - $100.


API Usage:

curl -u sk_abcdefQWERTY090900000000: \
  -d firstName=John00 \
  -d lastName=Doe00 \
  -d email=jd@example.com \
  -d password=xyzabc09090 \
  -d terms=true https://cocalc.com/api/v2/auth/sign-up

TIP: If you want to pass in an email like jd+1@example.com, use '%2B' in place of '+'.
*/

import { v4 } from "uuid";

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import createAccount from "@cocalc/server/accounts/create-account";
import isAccountAvailable from "@cocalc/server/auth/is-account-available";
import passwordStrength from "@cocalc/server/auth/password-strength";
import reCaptcha from "@cocalc/server/auth/recaptcha";
import { isExclusiveSSOEmail } from "@cocalc/server/auth/throttle";
import redeemRegistrationToken from "@cocalc/server/auth/tokens/redeem";
import sendWelcomeEmail from "@cocalc/server/email/welcome-email";
import getSiteLicenseId from "@cocalc/server/public-paths/site-license-id";
import {
  is_valid_email_address as isValidEmailAddress,
  len,
} from "@cocalc/util/misc";
import getAccountId from "lib/account/get-account";
import { apiRoute, apiRouteOperation } from "lib/api";
import assertTrusted from "lib/api/assert-trusted";
import getParams from "lib/api/get-params";
import {
  SignUpInputSchema,
  SignUpOutputSchema,
} from "lib/api/schema/accounts/sign-up";
import { SignUpIssues } from "lib/types/sign-up";
import { getAccount, signUserIn } from "./sign-in";
import { MAX_PASSWORD_LENGTH } from "@cocalc/util/auth";

export async function signUp(req, res) {
  let {
    terms,
    email,
    password,
    firstName,
    lastName,
    registrationToken,
    tags,
    publicPathId,
    signupReason,
  } = getParams(req);

  password = (password ?? "").trim();
  email = (email ?? "").toLowerCase().trim();
  firstName = (firstName ? firstName : "Anonymous").trim();
  lastName = (
    lastName ? lastName : `User-${Math.round(Date.now() / 1000)}`
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
  const { email_signup, anonymous_signup, anonymous_signup_licensed_shares } =
    await getServerSettings();

  const owner_id = await getAccountId(req);
  if (owner_id) {
    if (isAnonymous) {
      res.json({
        issues: {
          api: "Creation of anonymous accounts via the API is not allowed.",
        },
      });
      return;
    }
    // no captcha required -- api access
    // We ONLY allow creation without checking the captcha
    // for trusted users.
    try {
      await assertTrusted(owner_id);
    } catch (err) {
      res.json({
        issues: {
          api: `${err}`,
        },
      });
      return;
    }
  } else {
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
  }

  if (isAnonymous) {
    // Check anonymous sign up conditions.
    if (!anonymous_signup) {
      if (
        anonymous_signup_licensed_shares &&
        publicPathId &&
        (await hasSiteLicenseId(publicPathId))
      ) {
        // an unlisted public path with a license when anonymous_signup_licensed_shares is set is allowed
      } else {
        res.json({
          issues: {
            email: "Anonymous account creation is disabled.",
          },
        });
        return;
      }
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
    const exclusive = await isExclusiveSSOEmail(email);
    if (exclusive) {
      const name = exclusive.display ?? exclusive.name;
      res.json({
        issues: {
          email: `To sign up with "@${name}", you have to use the corresponding single sign on mechanism.  Delete your email address above, then click the SSO icon.`,
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
      tags,
      signupReason,
      owner_id,
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
    if (!owner_id) {
      await signUserIn(req, res, account_id); // sets a cookie
    }
    res.json({ account_id });
  } catch (err) {
    res.json({ error: err.message });
  }
}

export function checkObviousConditions({
  terms,
  email,
  password,
}): SignUpIssues {
  const issues: SignUpIssues = {};
  if (!terms) {
    issues.terms = "You must agree to the terms of usage.";
  }
  if (!email || !isValidEmailAddress(email)) {
    issues.email = `You must provide a valid email address -- '${email}' is not valid.`;
  }
  if (!password || password.length < 6) {
    issues.password = "Your password must not be very easy to guess.";
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    issues.password = `Your password must be at most ${MAX_PASSWORD_LENGTH} characters long.`;
  } else {
    const { score, help } = passwordStrength(password);
    if (score <= 2) {
      issues.password = help ? help : "Your password is too easy to guess.";
    }
  }
  return issues;
}

async function hasSiteLicenseId(id: string): Promise<boolean> {
  return !!(await getSiteLicenseId(id));
}

export default apiRoute({
  signUp: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Accounts", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: SignUpInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SignUpOutputSchema,
      },
    ])
    .handler(signUp),
});
