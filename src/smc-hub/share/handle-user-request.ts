/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map } from "immutable";
import { is_valid_uuid_string } from "smc-util/misc";
import { render_user } from "./render-user";
import { PublicPaths } from "./public-paths";
import { AuthorInfo } from "./authors";
import { SettingsDAO } from "./settings";

export async function handle_user_request(opts: {
  public_paths: PublicPaths;
  author_info: AuthorInfo;
  settings_dao: SettingsDAO;
  req: any;
  res: any;
}): Promise<void> {
  const { public_paths, author_info, settings_dao, req, res } = opts;
  const account_id: string = req.params.account_id;
  if (!is_valid_uuid_string(account_id)) {
    res.sendStatus(404);
    return;
  }
  if (public_paths == null) throw Error("public_paths must be defined");
  const name: string = await author_info.get_username(account_id);
  const ids: string[] = await author_info.get_shares(account_id);
  const settings = await settings_dao.get();
  let paths = public_paths.get(ids);
  if (paths == null) {
    paths = Map();
  }
  const paths_order = List(ids);
  render_user({
    res,
    account_id,
    name,
    paths_order,
    public_paths: paths,
    settings,
  });
}
