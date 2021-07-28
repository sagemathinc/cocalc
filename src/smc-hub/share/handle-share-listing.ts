/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const PAGE_SIZE: number = 100;

import { React } from "smc-webapp/app-framework";
import { PublicPathsBrowser } from "smc-webapp/share/public-paths-browser";

import { react_viewer } from "./react-viewer";
import { PublicPaths } from "./public-paths";
import { SettingsDAO } from "./settings";

export async function handle_share_listing(opts: {
  public_paths: PublicPaths;
  req: any;
  res: any;
  settings_dao: SettingsDAO;
}): Promise<void> {
  const { public_paths, req, res, settings_dao } = opts;

  if (req.originalUrl.split("?")[0].slice(-1) !== "/") {
    // note: req.path already has the slash added.
    res.redirect(301, req.baseUrl + req.path);
    return;
  }

  const settings = await settings_dao.get();

  const page_number = parseInt(req.query.page != null ? req.query.page : 1);

  if (public_paths == null) throw Error("public_paths must be defined");
  // TODO: "as any" due to Typescript confusion between two copies of immutable.js
  const paths_order: any = public_paths.order();
  const page = React.createElement(PublicPathsBrowser, {
    page_number: page_number,
    page_size: PAGE_SIZE,
    paths_order,
    public_paths: public_paths.get_all() as any, // TODO
  });
  const r = react_viewer(
    "/",
    undefined,
    true,
    "share",
    public_paths.is_public,
    settings,
    "Directory listing"
  );
  r(res, page, `${page_number} of ${PAGE_SIZE}`, true);
}
