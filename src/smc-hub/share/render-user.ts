/*
Render a page describing a user.

For now this is:
 - their name
 - a list of links to public paths that they definitely are involved with
*/

import { React } from "smc-webapp/app-framework";
import { UserPage } from "smc-webapp/share/user-page";
import { react } from "./react";

export function render_user(opts: { res: any; account_id: string }): void {
  const component = React.createElement(UserPage, {
    account_id: opts.account_id
  });
  react(opts.res, component);
}
