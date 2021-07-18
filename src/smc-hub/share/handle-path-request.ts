/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  filename_extension,
  is_valid_uuid_string,
  path_split,
} from "smc-util/misc";

import {
  default_to_raw,
  has_special_viewer,
} from "smc-webapp/share/file-contents";

import { render_public_path } from "./render-public-path";
import { render_static_path } from "./render-static-path";

import { HostInfo, PublicPaths } from "./public-paths";
import { AuthorInfo } from "./authors";
import { SettingsDAO } from "./settings";
import { react_viewer } from "./react-viewer";

export async function handle_path_request(opts: {
  public_paths: PublicPaths;
  author_info: AuthorInfo;
  settings_dao: SettingsDAO;
  req: any;
  res: any;
  path_to_files: Function;
  viewer?: "download" | "raw" | "share" | "embed";
}): Promise<void> {
  const {
    public_paths,
    author_info,
    settings_dao,
    req,
    res,
    path_to_files,
  } = opts;
  let viewer = opts.viewer;

  let info: HostInfo | undefined;
  let project_id: string;
  if (is_valid_uuid_string(req.params.id)) {
    // explicit project_id specified instead of sha1 hash id of share.
    info = undefined;
    project_id = req.params.id;
  } else {
    const id: string | undefined = req.params.id;
    if (id == null || public_paths == null) {
      res.sendStatus(404);
      return;
    }
    info = public_paths.get(id);
    if (info == null || info.get("auth")) {
      // TODO: For now, /share server does NOT make vhost visible at all if there is any auth info..
      res.sendStatus(404);
      return;
    }
    project_id = info.get("project_id");
  }

  const path = req.params[0];
  if (path == null) {
    res.sendStatus(404);
    return;
  }

  // Check that the requested path is definitely contained
  // in a current valid non-disabled public path.  This is important so:
  //   (a) if access is via public_path id and that path just got
  //   revoked, but share server hasn't caught up and removed target,
  //   then we want request to still be denied.
  //   (b) when accessing by project_id, the only restriction would be
  //   by what happens to be in the path to files.  So share server not having
  //   updated yet is a problem, but ALSO, in some cases (dev server, docker personal)
  //   that path is just to the live files in the project, so very dangerous.
  if (viewer == null) {
    // if it is not explicitly specified, take if from query param.
    viewer = req.query.viewer;
  }
  const { token } = req.query;

  if (
    viewer != null &&
    viewer != "share" &&
    viewer != "embed" &&
    viewer != "raw" &&
    viewer != "download"
  ) {
    viewer = "share";
  }

  if (public_paths == null) {
    res.sendStatus(404);
    return;
  }

  const public_path: string | undefined = public_paths.public_path(
    project_id,
    path
  );

  if (
    public_path == null ||
    !public_paths.is_access_allowed(project_id, public_path, token)
  ) {
    res.sendStatus(404);
    return;
  }

  if (info == null) {
    info = public_paths.get_info(project_id, public_path);
    if (info == null) {
      res.sendStatus(404);
      return;
    }
  }

  const description: string | undefined = info.get("description");

  const dir: string = path_to_files(project_id);
  if (viewer == null) {
    const ext = filename_extension(path);
    if (!default_to_raw(ext) && has_special_viewer(ext)) {
      viewer = "share";
    } else {
      viewer = "raw";
    }
  }

  switch (viewer) {
    case "raw":
      render_static_path({
        req,
        res,
        dir,
        path,
      });
      break;

    case "download":
      const filename = path_split(path).tail;
      res.download(dir + "/" + path, filename);
      break;

    default:
      const authors = await author_info.get_authors(project_id, path);
      const settings = await settings_dao.get();

      public_paths.increment_view_counter(project_id, public_path);
      let views: undefined | number = undefined;
      if (path == public_path || path == public_path + "/") {
        views = public_paths.get_views(project_id, public_path);
      }
      render_public_path({
        req,
        res,
        info,
        dir,
        path,
        react: react_viewer(
          `/${req.params.id}/${path}`,
          project_id,
          false,
          viewer,
          public_paths.is_public,
          settings,
          description,
          `/${info.get("id")}/${path}`,
        ),
        viewer,
        hidden: req.query.hidden,
        sort: req.query.sort != null ? req.query.sort : "name",
        authors,
        views,
      });
  }
}
