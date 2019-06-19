/*
Router for public share server.
*/

const PAGE_SIZE: number = 100;

import * as os_path from "path";

import { React } from "smc-webapp/app-framework";

import * as express from "express";
import { is_valid_uuid_string } from "smc-util/misc";

import * as react_support from "./react";

import { PublicPathsBrowser } from "smc-webapp/share/public-paths-browser";
import { IsPublicFunction, Page } from "smc-webapp/share/page";
import { get_public_paths0, PublicPaths, HostInfo } from "./public-paths";
import { render_public_path } from "./render-public-path";
import { render_static_path } from "./render-static-path";

const util = require("./util.coffee");
// import * as util from "./util.coffee";

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
      Page,
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

  let _ready_queue: Function[] = [];
  let public_paths: PublicPaths | undefined = undefined;
  dbg("getting_public_paths");
  get_public_paths0(opts.database, function(err, x): void {
    if (err) {
      // This is fatal and should be impossible...
      dbg("get_public_paths - ERROR", err);
      return;
    } else {
      public_paths = x;
      dbg("got_public_paths - initialized");
      for (let cb of _ready_queue) {
        cb();
      }
      _ready_queue = [];
    }
  });

  function ready(cb: Function): void {
    if (public_paths != null) {
      cb();
    } else {
      _ready_queue.push(cb);
    }
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

  router.get("/", function(req, res): void {
    log_ip(req);
    if (req.originalUrl.split("?")[0].slice(-1) !== "/") {
      // note: req.path already has the slash added.
      res.redirect(301, req.baseUrl + req.path);
      return;
    }
    ready(function(): void {
      const page_number = parseInt(req.query.page != null ? req.query.page : 1);

      // TODO: "as any" due to Typescript confusion between two copies of immutable.js
      if (public_paths == null) {
        throw Error("public_paths must be defined");
      }
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
  });

  router.get("/:id/*?", function(req, res): void {
    log_ip(req);
    ready(function(): void {
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
      const { viewer } = req.query;
      if (viewer != null) {
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
          sort: req.query.sort != null ? req.query.sort : "-mtime"
        });
      } else {
        render_static_path({
          req,
          res,
          dir,
          path
        });
      }
    });
  });

  router.get("*", (req, res) => res.send(`unknown path='${req.path}'`));

  return router;
}
