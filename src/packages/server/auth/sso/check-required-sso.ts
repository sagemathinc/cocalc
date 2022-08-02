import { Strategy } from "@cocalc/util/types/sso";

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
