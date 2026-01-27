/*
 *  This file is part of CoCalc: Copyright © 2022-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { is_valid_email_address } from "@cocalc/util/misc";
import { Strategy } from "@cocalc/util/types/sso";

interface Opts {
  email: string | undefined;
  strategies: Strategy[] | undefined;
  specificStrategy?: string;
}

/**
 * If the domain of a given email address belongs to an SSO strategy,
 * which is configured to be an "exclusive" domain, then return the Strategy.
 * This also matches subdomains, i.e. "foo@bar.baz.edu" is goverend by "baz.edu",
 * while "foo@barbaz.edu" is NOT goverend by "baz.edu".
 *
 * Special case: an sso domain "*" covers all domains, not covered by any other
 * exclusive SSO strategy. If there is just one such "*"-SSO strategy, it will deal with all
 * accounts.
 *
 * Optionally, if @specificStrategy is set, only that strategy or "*" is checked!
 */
export function checkRequiredSSO(opts: Opts): Strategy | undefined {
  const { email, strategies, specificStrategy } = opts;
  // if the domain of email is contained in any of the strategie's exclusiveDomain array, return that strategy's name
  if (!email) return;
  if (strategies == null || strategies.length === 0) return;
  if (email.indexOf("@") === -1) return;
  if (!is_valid_email_address(email)) return;
  const emailDomain = getEmailDomain(email);
  if (!emailDomain) return;
  for (const strategy of strategies) {
    if (specificStrategy && specificStrategy !== strategy.name) continue;
    for (const ssoDomain of strategy.exclusiveDomains) {
      if (ssoDomain === "*") continue; // dealt with below
      if (emailBelongsToDomain(emailDomain, ssoDomain)) {
        return strategy;
      }
    }
  }
  // At this point, we either matched an existing strategy (above) or there is a "*" strategy
  for (const strategy of strategies) {
    if (specificStrategy && specificStrategy !== strategy.name) continue;
    if (strategy.exclusiveDomains.includes("*")) {
      return strategy;
    }
  }
}

export function getEmailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1];
}

/**
 * This checks if the email's domain is either exactly the ssoDomain or a subdomain.
 * E.g. for "foo.edu", an email "name@mail.foo.edu" is covered as well.
 * Note: Both emailDomain (from getEmailDomain) and ssoDomain (from database queries)
 * are normalized to lowercase, so direct comparison is safe.
 */
export function emailBelongsToDomain(
  emailDomain: string,
  ssoDomain: string,
): boolean {
  return emailDomain === ssoDomain || emailDomain.endsWith(`.${ssoDomain}`);
}
