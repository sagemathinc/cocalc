/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PassportLoginOpts } from "@cocalc/database/settings/auth-sso-types";
import {
  firstLetterUppercase,
  is_valid_email_address,
} from "@cocalc/util/misc";

// this processes the profile, based on our general experience
// in particular, an interesting detail to add would be to derive a "name" if
// there is just an email address given. (there are workarounds for OAuth2 elsewhere)

export function sanitizeProfile(opts: PassportLoginOpts, L: Function): void {
  if (
    opts.full_name != null &&
    opts.first_name == null &&
    opts.last_name == null
  ) {
    const name = opts.full_name;
    const i = name.lastIndexOf(" ");
    if (i === -1) {
      opts.first_name = "";
      opts.last_name = name;
    } else {
      opts.first_name = name.slice(0, i).trim();
      opts.last_name = name.slice(i).trim();
    }
  }

  opts.first_name = opts.first_name ?? "";
  opts.last_name = opts.last_name ?? "";

  // pick first email that is valid – or the only one in the "emails" param.
  if (opts.emails != null) {
    const email_arr =
      typeof opts.emails == "string" ? [opts.emails] : opts.emails;

    opts.emails = email_arr
      .filter((x) => typeof x === "string" && is_valid_email_address(x))
      .map((x) => x.toLowerCase());
  }

  // Heuristic: even though there is this "parseOpenIdProfile" function,
  // in some cases it isn't called properly or there is just an error querying the userinfo endpoint.
  // In any case, this tries to extract the name from the email address.
  if (!opts.first_name && !opts.last_name) {
    const email = opts.emails?.[0]; // from the above, we know this is valid or there is no email at all
    L(`No name, trying to extract from email address '${email}'`);
    if (email) {
      // don't include dots, because our "spam protection" rejects domain-like patterns
      const emailacc = email.split("@")[0].split(".").map(firstLetterUppercase);
      if (emailacc.length > 1) {
        // last is always at least an array with the part before @
        const [first, ...last] = emailacc;
        opts.first_name = first;
        opts.last_name = last.join(" ");
      } else {
        opts.first_name = "";
        opts.last_name = emailacc.join(" ");
      }
    }
  }
}
