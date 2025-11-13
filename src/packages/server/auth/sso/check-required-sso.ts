/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Strategy } from "@cocalc/util/types/sso";

/**
 * If the domain of a given email address belongs to an SSO strategy,
 * which is configured to be an "exclusive" domain, then return the Strategy.
 * This also matches subdomains, i.e. "foo@bar.baz.edu" is goverend by "baz.edu".
 */

interface Opts {
  email: string | undefined;
  strategies: Strategy[] | undefined;
  specificStrategy?: string;
}

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

export function emailBelongsToDomain(
  emailDomain: string,
  ssoDomain: string
): boolean {
  return emailDomain === ssoDomain || emailDomain.endsWith(`.${ssoDomain}`);
}
