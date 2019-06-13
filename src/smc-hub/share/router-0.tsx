/*
Router for public share server.
*/

const PAGE_SIZE: number = 100;

import * as os_path from "path";

import { React } from "smc-webapp/app-framework";

import * as express from "express";
import * as misc from "smc-util/misc";
const { defaults, required } = misc;

import { PublicPathsBrowser } from "smc-webapp/share/public-paths-browser";
import { Page } from "smc-webapp/share/page";

// import react_support from "./react";
// import { get_public_paths } from "./public_paths";
// import { render_public_path } from "./render-public-path";
// import { render_static_path } from "./render-static-path";

const react_support = require("./react");
const { get_public_paths } = require("./public_paths");
const { render_public_path } = require("./render-public-path");
const { render_static_path } = require("./render-static-path");

import * as util from "./util";

// this reads it from disk blocking.
const google_analytics: string | undefined = util.google_analytics_token();

const react_viewer = (
  base_url,
  path,
  project_id,
  notranslate,
  viewer,
  is_public
) =>
  function(res, component, subtitle) {
    const the_page = (
      <Page
        base_url={base_url}
        path={path}
        project_id={project_id}
        subtitle={subtitle}
        notranslate={!!notranslate}
        google_analytics={google_analytics}
        viewer={viewer}
        is_public={is_public}
      >
        {component}
      </Page>
    );
    const extra = { path, project_id }; // just used for log
    return react_support.react(res, the_page, extra, viewer);
  };

export function share_router(opts) {
  let dbg;
  opts = defaults(opts, {
    database: required,
    path: required,
    logger: undefined,
    base_url: ""
  });

  (global as any).window["app_base_url"] = opts.base_url;

  if (opts.logger != null) {
    dbg = (...args) => opts.logger.debug("share_router: ", ...args);
  } else {
    dbg = function() {};
  }

  dbg("base_url = ", opts.base_url);
  dbg("path = ", opts.path);

  const log_ip = function(req) {
    const ip_addresses =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    return dbg(`remote='${ip_addresses}' requests url='${req.url}'`);
  };

  if (opts.path.indexOf("[project_id]") === -1) {
    // VERY BAD
    throw Error("opts.path must contain '[project_id]'");
  }

  const path_to_files = project_id => util.path_to_files(opts.path, project_id);

  let _ready_queue: Function[] = [];
  let public_paths: any = undefined;
  dbg("getting_public_paths");
  get_public_paths(opts.database, function(err, x) {
    if (err) {
      // This is fatal and should be impossible...
      return dbg("get_public_paths - ERROR", err);
    } else {
      public_paths = x;
      dbg("got_public_paths - initialized");
      for (let cb of _ready_queue) {
        cb();
      }
      return (_ready_queue = []);
    }
  });

  const ready = function(cb) {
    if (public_paths != null) {
      return cb();
    } else {
      return _ready_queue.push(cb);
    }
  };

  const router = express.Router();
  if (process.env.SMC_ROOT == null) {
    throw Error("process.env.SMC_ROOT must be defined!");
  }
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
  router.get("/share.css", function(_req, res) {
    res.type("text/css");
    return res.send(`\
.cocalc-jupyter-anchor-link {
  visibility : hidden
};\
`);
  });

  router.get("/", function(req, res) {
    log_ip(req);
    if (req.originalUrl.split("?")[0].slice(-1) !== "/") {
      // note: req.path already has the slash added.
      res.redirect(301, req.baseUrl + req.path);
      return;
    }
    return ready(function() {
      const page_number = parseInt(req.query.page != null ? req.query.page : 1);
      const page = (
        <PublicPathsBrowser
          page_number={page_number}
          page_size={PAGE_SIZE}
          paths_order={public_paths.order()}
          public_paths={public_paths.get()}
        />
      );
      const r = react_viewer(
        opts.base_url,
        "/",
        undefined,
        true,
        "share",
        public_paths.is_public
      );
      return r(res, page, `${page_number} of ${PAGE_SIZE}`);
    });
  });

  router.get("/:id/*?", function(req, res) {
    log_ip(req);
    return ready(function() {
      let info, project_id;
      if (misc.is_valid_uuid_string(req.params.id)) {
        // explicit project_id specified instead of sha1 hash id of share.
        project_id = req.params.id;
        info = undefined;
      } else {
        info = public_paths.get(req.params.id);
        if (info == null || info.get("auth")) {
          // TODO: For now, /share server does NOT make vhost visible at all if there is any auth info..
          res.sendStatus(404);
          return;
        }
        project_id = info.get("project_id");
      }

      const path = req.params[0];
      //dbg("router.get '/:id/*?': #{project_id} and #{path}: #{public_paths.is_public(project_id, path)}, info: #{misc.to_json(info)}, path: #{path}")
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

      if (!public_paths.is_public(project_id, path)) {
        res.sendStatus(404);
        return;
      }

      const dir = path_to_files(project_id);
      const { viewer } = req.query;
      if (viewer != null) {
        return render_public_path({
          req,
          res,
          info,
          dir,
          path,
          react: react_viewer(
            opts.base_url,
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
        return render_static_path({
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
