const PAGE_SIZE: number = 100;

import { React } from "smc-webapp/app-framework";
import { PublicPathsBrowser } from "smc-webapp/share/public-paths-browser";

import { react_viewer } from "./react-viewer";
import { PublicPaths } from "./public-paths";

export function handle_share_listing(opts: {
  public_paths: PublicPaths;
  base_url: string;
  req: any;
  res: any;
}): void {
  const { public_paths, base_url, req, res } = opts;

  if (req.originalUrl.split("?")[0].slice(-1) !== "/") {
    // note: req.path already has the slash added.
    res.redirect(301, req.baseUrl + req.path);
    return;
  }

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
    base_url,
    "/",
    undefined,
    true,
    "share",
    public_paths.is_public,
    "Directory listing"
  );
  r(res, page, `${page_number} of ${PAGE_SIZE}`, true);
}
