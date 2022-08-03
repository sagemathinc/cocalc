/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Strategy } from "@cocalc/util/types/sso";

/**
 * If the domain of a given email address belongs to an SSO strategy,
 * which is configured to be an "exclusive" domain, then return the Strategy.
 * This also matches subdomains, i.e. "foo@bar.baz.edu" is goverend by "baz.edu".
 */
export function checkRequiredSSO(
  email: string | undefined,
  strategies: Strategy[] | undefined
): Strategy | undefined {
  // if the domain of email is contained in any of the strategie's exclusiveDomain array, return that strategy's name
  if (email == null) return;
  if (strategies == null || strategies.length === 0) return;
  if (email.indexOf("@") === -1) return;
  const emailDomain = email.trim().toLowerCase().split("@")[1];
  if (!emailDomain) return;
  for (const strategy of strategies) {
    for (const ssoDomain of strategy.exclusiveDomains) {
      if (emailDomain === ssoDomain || emailDomain.endsWith(`.${ssoDomain}`))
        return strategy;
    }
  }
}
