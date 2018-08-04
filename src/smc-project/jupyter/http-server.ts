/*
HTTP server for getting various information from Jupyter, without
having to go through the websocket connection and messaging.  This is
useful, e.g., for big images, general info about all available
kernels, sending signals, doing tab completions, and so on.
*/

/* TODO: rewrite to be async */

export function http_server(opts) {
  let cursor_pos, key, level, value;
  opts = defaults(opts, {
    jupyter: required,
    segments: required,
    query: required,
    cb: required
  });

  const dbg = jupyter.dbg("http_server");
  dbg(opts.segments.join("/"));
  switch (opts.segments[0]) {
    case "signal":
      jupyter.signal(opts.segments[1]);
      return opts.cb(undefined, {});

    case "kernel_info":
      return jupyter.kernel_info({ cb: opts.cb });

    case "more_output":
      return jupyter.more_output({
        id: opts.query.id,
        cb: opts.cb
      });

    case "complete":
      var { code } = opts.query;
      if (!code) {
        opts.cb("must specify code to complete");
        return;
      }
      if (opts.query.cursor_pos != null) {
        try {
          cursor_pos = parseInt(opts.query.cursor_pos);
        } catch (error) {
          cursor_pos = code.length;
        }
      } else {
        cursor_pos = code.length;
      }
      return jupyter.complete({
        code: opts.query.code,
        cursor_pos,
        cb: opts.cb
      });

    case "introspect":
      ({ code } = opts.query);
      if (code == null) {
        opts.cb("must specify code to introspect");
        return;
      }
      if (opts.query.cursor_pos != null) {
        try {
          cursor_pos = parseInt(opts.query.cursor_pos);
        } catch (error1) {
          cursor_pos = code.length;
        }
      } else {
        cursor_pos = code.length;
      }
      if (opts.query.level != null) {
        try {
          level = parseInt(opts.query.level);
          if (level < 0 || level > 1) {
            level = 0;
          }
        } catch (error2) {
          level = 0;
        }
      } else {
        level = 0;
      }
      return jupyter.introspect({
        code: opts.query.code,
        cursor_pos,
        detail_level: level,
        cb: opts.cb
      });

    case "store":
      try {
        if (opts.query.key != null) {
          key = JSON.parse(opts.query.key);
        } else {
          key = undefined;
        }
        if (opts.query.value != null) {
          value = JSON.parse(opts.query.value);
        } else {
          value = undefined;
        }
      } catch (err) {
        opts.cb(err);
        return;
      }
      if (value == null) {
        return opts.cb(undefined, jupyter.store.get(key));
      } else if (value === null) {
        jupyter.store.delete(key);
        return opts.cb();
      } else {
        jupyter.store.set(key, value);
        return opts.cb();
      }

    default:
      return opts.cb(`no route '${opts.segments.join("/")}'`);
  }
}

const jupyter_kernel_info_handler = function(base, router) {
  router.get(base + "kernels.json", (req, res) =>
    get_kernel_data(function(err, kernel_data) {
      if (err) {
        return res.send(err); // TODO: set some code
      } else {
        return res.send(kernel_data.jupyter_kernels_json);
      }
    })
  );

  router.get(base + "kernelspecs/*", (req, res) =>
    get_kernel_data(function(err, kernel_data) {
      if (err) {
        return res.send(err); // TODO: set some code
      } else {
        let path = req.path.slice((base + "kernelspecs/").length).trim();
        if (path.length === 0) {
          res.send(kernel_data.jupyter_kernels_json);
          return;
        }
        const segments = path.split("/");
        const name = segments[0];
        const kernel = kernel_data.kernelspecs[name];
        if (kernel == null) {
          res.send(`no such kernel '${name}'`); // todo: error?
          return;
        }
        // kernelspecs incorrectly calls it resources_dir instead of resource_dir.
        // See https://github.com/nteract/kernelspecs/issues/25
        const resource_dir =
          kernel.resource_dir != null
            ? kernel.resource_dir
            : kernel.resources_dir;
        path = require("path").join(resource_dir, segments.slice(1).join("/"));
        path = require("path").resolve(path);
        if (!misc.startswith(path, resource_dir)) {
          // don't let user use .. or something to get any file on the server...!
          // (this really can't happen due to url rules already; just being super paranoid.)
          return res.send(`suspicious path '${path}'`);
        } else {
          return fs.exists(path, function(exists) {
            if (!exists) {
              return res.send(`no such path '${path}'`);
            } else {
              return res.sendFile(path);
            }
          });
        }
      }
    })
  );
  return router;
};

function jupyter_kernel_http_server(base, router) {
  router.get(base + "kernels/*", function(req, res) {
    let path = req.path.slice((base + "kernels/").length).trim();
    if (path.length === 0) {
      res.send(kernel_data.jupyter_kernels_json);
      return;
    }
    const segments = path.split("/");
    ({ path } = req.query);
    const kernel = _jupyter_kernels[path];
    if (kernel == null) {
      res.send(JSON.stringify({ error: `no kernel with path '${path}'` }));
      return;
    }
    return kernel.http_server({
      segments,
      query: req.query,
      cb(err, resp) {
        if (err) {
          return res.send(JSON.stringify({ error: err }));
        } else {
          return res.send(JSON.stringify(resp != null ? resp : {}));
        }
      }
    });
  });

  return router;
}

export function jupyter_router(express) {
  const base = "/.smc/jupyter/";

  // Install handling for the blob store
  let router = blob_store.express_router(base, express);

  // Handler for Jupyter kernel info
  router = jupyter_kernel_info_handler(base, router);

  // Handler for http messages for **specific kernels**
  router = jupyter_kernel_http_server(base, router);

  return router;
}
