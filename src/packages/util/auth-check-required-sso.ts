/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Strategy } from "@cocalc/util/types/sso";

interface Opts {
  email: string | undefined;
  strategies: Strategy[] | undefined;
  specificStrategy?: string;
}

/**
 * If the domain of a given email address belongs to an SSO strategy,
 * which is configured to be an "exclusive" domain, then return the Strategy.
 * This also matches subdomains, i.e. "foo@bar.baz.edu" is goverend by "baz.edu".
 *
 * Optionally, if @specificStrategy is set, only that strategy is checked!
 */
export function checkRequiredSSO(opts: Opts): Strategy | undefined {
  const { email, strategies, specificStrategy } = opts;
  // if the domain of email is contained in any of the strategie's exclusiveDomain array, return that strategy's name
  if (email == null) return;
  if (strategies == null || strategies.length === 0) return;
  if (email.indexOf("@") === -1) return;
  const emailDomain = getEmailDomain(email);
  if (!emailDomain) return;
  for (const strategy of strategies) {
    if (specificStrategy && specificStrategy !== strategy.name) continue;
    for (const ssoDomain of strategy.exclusiveDomains) {
      if (emailBelongsToDomain(emailDomain, ssoDomain)) {
        return strategy;
      }
    }
  }
}

export function getEmailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1];
}

/**
 * This checks if the email's domain is either exactly the ssoDomain or a subdomain.
 * E.g. for "foo.edu", an email "name@mail.foo.edu" is covered as well.
 *
 * Special case: an sso domain "*" covers all domains. This is kind of a complete "take over",
 * because all accounts on that instance of CoCalc have to go through that SSO mechanism.
 * Note: In that case, it makes no sense to have more than one SSO mechanism configured.
 */
export function emailBelongsToDomain(
  emailDomain: string,
  ssoDomain: string,
): boolean {
  if (ssoDomain === "*") return true;
  return emailDomain === ssoDomain || emailDomain.endsWith(`.${ssoDomain}`);
}
