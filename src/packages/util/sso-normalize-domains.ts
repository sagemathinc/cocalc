/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

interface SsoExclusiveDomains {
  exclusive_domains?: string[];
  exclusiveDomains?: string[];
}

function normalizeDomainsInPlace(domains: string[]): void {
  for (let i = 0; i < domains.length; i += 1) {
    domains[i] = domains[i].trim().toLowerCase();
  }
}

export function ssoNormalizeExclusiveDomains(
  strategy: SsoExclusiveDomains,
): void {
  if (strategy.exclusive_domains != null) {
    normalizeDomainsInPlace(strategy.exclusive_domains);
  }
  if (strategy.exclusiveDomains != null) {
    normalizeDomainsInPlace(strategy.exclusiveDomains);
  }
}
