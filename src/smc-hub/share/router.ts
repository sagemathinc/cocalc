/*
Router for public share server.
*/

const PAGE_SIZE: number = 100;

import * as immutable from "immutable";
import * as os_path from "path";
import { callback } from "awaiting";
import * as express from "express";

import { React } from "smc-webapp/app-framework";
import {
  filename_extension,
  is_valid_uuid_string,
  path_split
} from "smc-util/misc2";

import * as react_support from "./react";

import { PublicPathsBrowser } from "smc-webapp/share/public-paths-browser";
import {
  default_to_raw,
  has_special_viewer
} from "smc-webapp/share/file-contents";
import { ContentPage } from "smc-webapp/share/content-page";
import { IsPublicFunction } from "smc-webapp/share/types";
import { get_public_paths, PublicPaths, HostInfo } from "./public-paths";
import { AuthorInfo } from "./authors";
import { render_public_path } from "./render-public-path";
import { render_static_path } from "./render-static-path";
import { render_user } from "./render-user";

import * as util from "./util";

import { Database, Logger } from "./types";

// this reads it from disk
const google_analytics = util.google_analytics_token();

function react_viewer(
  base_url: string,
  path: string,
  project_id: string | undefined,
  notranslate: boolean,
  viewer: string,
  is_public: IsPublicFunction
): Function {
  return function(res, component, subtitle: string): void {
    const the_page = React.createElement(
      ContentPage,
      {
        base_url,
        path,
        project_id,
        subtitle,
        notranslate,
        google_analytics,
        viewer,
        is_public
      },
      component
    );
    const extra = { path, project_id }; // just used for log
    react_support.react(res, the_page, extra);
  };
}

export function share_router(opts: {
  database: Database;
  path: string;
  logger?: Logger;
  base_url?: string;
}) {
  let dbg;

  const author_info: AuthorInfo = new AuthorInfo(opts.database);

  const base_url: string = opts.base_url != null ? opts.base_url : "";

  if ((global as any).window != null) {
    (global as any).window["app_base_url"] = base_url;
  }

  if (opts.logger != null) {
    const logger = opts.logger;
    dbg = (...args) => logger.debug("share_router: ", ...args);
  } else {
    dbg = (..._args) => {};
  }

  dbg("base_url = ", base_url);
  dbg("path = ", opts.path);

  function log_ip(req): void {
    const ip_addresses =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    dbg(`remote='${ip_addresses}' requests url='${req.url}'`);
  }

  if (opts.path.indexOf("[project_id]") === -1) {
    // VERY BAD situation
    throw Error(`opts.path (='${opts.path}')must contain '[project_id]'`);
  }
  const path_to_files: Function = project_id =>
    util.path_to_files(opts.path, project_id);

  let ready_queue: Function[] = [];
  dbg("getting_public_paths");
  let public_paths: PublicPaths | undefined = undefined;
  async function init_public_paths(): Promise<void> {
    try {
      public_paths = await get_public_paths(opts.database);
    } catch (err) {
      // This is fatal and should be impossible...
      dbg("get_public_paths - ERROR", err);
      return;
    }
    dbg("got_public_paths - initialized");
    const v = ready_queue;
    ready_queue = [];
    for (let cb of v) {
      cb();
    }
  }
  // do not await since we want all the code below to run first.
  init_public_paths();

  async function ready(): Promise<void> {
    if (public_paths != null) return;
    // wait until public_paths is ready.
    await callback(cb => ready_queue.push(cb));
  }

  if (process.env.SMC_ROOT == null) {
    throw Error("process.env.SMC_ROOT must be defined");
  }
  const router = express.Router();
  for (let name of ["favicon-32x32.png", "cocalc-icon.svg"]) {
    router.use(
      `/${name}`,
      express.static(os_path.join(process.env.SMC_ROOT, `webapp-lib/${name}`), {
        immutable: true,
        maxAge: 86000000
      })
    );
  }

  // TODO: serve from static file when/if it gets at all big; or from some refactor
  // of our existing css.  That said, our aim for the share server is extreme cleanliness
  // and simplicity, so what we want may be different from cocalc interactive.
  router.get("/share.css", function(_req, res): void {
    res.type("text/css");
    res.send(`\
.cocalc-jupyter-anchor-link {
  visibility : hidden
};\
`);
  });

  router.get("/", async function(req, res): Promise<void> {
    log_ip(req);
    if (req.originalUrl.split("?")[0].slice(-1) !== "/") {
      // note: req.path already has the slash added.
      res.redirect(301, req.baseUrl + req.path);
      return;
    }
    await ready();

    const page_number = parseInt(req.query.page != null ? req.query.page : 1);

    if (public_paths == null) throw Error("public_paths must be defined");
    // TODO: "as any" due to Typescript confusion between two copies of immutable.js
    const paths_order: any = public_paths.order();
    const page = React.createElement(PublicPathsBrowser, {
      page_number: page_number,
      page_size: PAGE_SIZE,
      paths_order,
      public_paths: public_paths.get_all() as any // TODO
    });
    const r = react_viewer(
      base_url,
      "/",
      undefined,
      true,
      "share",
      public_paths.is_public
    );
    r(res, page, `${page_number} of ${PAGE_SIZE}`);
  });

  router.get("/users", async function(req, res): Promise<void> {
    log_ip(req);
    await ready();
    res.send("the users who share are: ");
  });

  router.get("/users/:account_id", async function(req, res): Promise<void> {
    log_ip(req);
    const account_id: string = req.params.account_id;
    if (!is_valid_uuid_string(account_id)) {
      res.sendStatus(404);
      return;
    }
    await ready();
    if (public_paths == null) throw Error("public_paths must be defined");
    // dbg("get user ", account_id);
    const name: string = await author_info.get_username(account_id);
    // dbg("got name", name);
    const ids: string[] = await author_info.get_shares(account_id);
    // dbg("got ids", JSON.stringify(ids));
    let paths = public_paths.get(ids);
    if (paths == null) {
      dbg("BUG -- public_paths.get returned null");
      paths = immutable.Map();
    }
    const paths_order = immutable.List(ids);
    render_user({
      res,
      account_id,
      name,
      paths_order,
      public_paths: paths,
      google_analytics,
      base_url
    });
  });

  router.get("/:id/*?", async function(req, res): Promise<void> {
    log_ip(req);
    await ready();

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
      //dbg("no path → 404")
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

    if (public_paths == null || !public_paths.is_public(project_id, path)) {
      res.sendStatus(404);
      return;
    }

    const dir: string = path_to_files(project_id);
    let { viewer } = req.query;
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
          path
        });
        break;

      case "download":
        const filename = path_split(path).tail;
        res.download(dir + "/" + path, filename);
        break;

      default:
        const authors = await author_info.get_authors(project_id, path);
        render_public_path({
          req,
          res,
          info,
          dir,
          path,
          react: react_viewer(
            base_url,
            `/${req.params.id}/${path}`,
            project_id,
            false,
            viewer,
            public_paths.is_public
          ),
          viewer,
          hidden: req.query.hidden,
          sort: req.query.sort != null ? req.query.sort : "-mtime",
          authors,
          base_url
        });
    }
  });

  router.get("*", (req, res) => res.send(`unknown path='${req.path}'`));

  return router;
}
