/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Just enough about configured SSO strategies to display to the user
export interface Strategy {
  name: string;
  display: string; // name to display for SSO
  icon?: string; // name of or URL to icon to display for SSO
  backgroundColor: string; // background color for icon, if not a link
  public: boolean; // true for general broad audiences, like google, default true
  exclusiveDomains: string[]; // list of domains, e.g. ["foo.com"], which must go through that SSO mechanism (and block regular email signup)
  doNotHide: boolean; // if true and a public=false, show it directly on the login/signup page
}
