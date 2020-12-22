export const PRIMARY_SSO: readonly string[] = [
  "google",
  "facebook",
  "github",
  "twitter",
];

export interface PassportStrategy {
  name: string; // the internal ID
  display?: string; // the name to dispaly -- or capitalize(name)
  type?: string; // oauth2, ldap, ...
  icon?: string; // a URL to a square image
  public?: boolean; // true, if the SSO strategy, like Google, is not private
  exclusive_domains?: string[]; // list of domains, e.g. ["foo.com"], which must go through that SSO mechanism (and hence block normal email signup)
}
