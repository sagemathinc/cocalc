/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_valid_email_address } from "@cocalc/util/misc";
import { PassportLoginOpts } from "@cocalc/server/auth/sso/types";

// this processes the profile, based on our general experience
// in particular, an interesting detail to add would be to derive a "name" if
// there is just an email address given. (there are workarounds for OAuth2 elsewhere)

export function sanitizeProfile(opts: PassportLoginOpts): void {
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
}
