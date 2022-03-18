export const PRIMARY_SSO = ["google", "facebook", "github", "twitter"] as const;

// this is frontend!
export interface PassportStrategyFrontend {
  name: string; // the internal ID (also -- name of icon)
  display?: string; // the name to dispaly -- or capitalize(name)
  type?: string; // oauth2, ldap, ...
  icon?: string; // a **URL** to a square image
  public?: boolean; // true, if the SSO strategy is a public one like Google – otherwise it's private (university, company)
  exclusive_domains?: string[]; // list of domains, e.g. ["foo.com"], which must go through that SSO mechanism (and hence block normal email signup)
}
