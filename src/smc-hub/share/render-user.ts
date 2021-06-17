/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a page describing a user.

For now this is:
 - their name
 - a list of links to public paths that they definitely are involved with
*/
import { Map, List } from "immutable";
import { React } from "smc-webapp/app-framework";
import { UserPage } from "smc-webapp/share/user-page";
import * as react_support from "smc-webapp/share/server-render";
import { Settings } from "./settings";
import base_path from "smc-util-node/base-path";

export function render_user(opts: {
  res: any;
  account_id: string;
  name: string;
  public_paths: Map<string, any>;
  paths_order: List<string>;
  settings: Settings;
}): void {
  const component = React.createElement(UserPage, { ...opts, base_path });
  react_support.render(opts.res, component);
}
