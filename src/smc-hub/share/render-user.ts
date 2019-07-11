/*
Render a page describing a user.

For now this is:
 - their name
 - a list of links to public paths that they definitely are involved with
*/

import { React } from "smc-webapp/app-framework";
import { UserPage } from "smc-webapp/share/user-page";
import { react } from "./react";

export function render_user(opts: {
  res: any;
  account_id: string;
  name: string;
  google_analytics?: string;
  base_url: string;
}): void {
  const component = React.createElement(UserPage, {
    account_id: opts.account_id,
    google_analytics: opts.google_analytics,
    base_url: opts.base_url,
    name: opts.name
  });
  react(opts.res, component);
}
