/*
HTTP server for getting various information from Jupyter, without
having to go through the websocket connection and messaging.  This is
useful, e.g., for big images, general info about all available
kernels, sending signals, doing tab completions, and so on.
*/

const BASE = "/.smc/jupyter/";

function get_code_and_cursor_pos(
  query: object
): { code: string; cursor_pos: number } {
  const code: string = query.code;
  if (!code) {
    throw Error("must specify code");
  }
  let cursor_pos: number;
  if (query.cursor_pos != null) {
    try {
      cursor_pos = parseInt(query.cursor_pos);
    } catch (error) {
      cursor_pos = code.length;
    }
  } else {
    cursor_pos = code.length;
  }

  return { code, cursor_pos };
}

async function handle_http_request(
  kernel: any,
  segments: string[],
  query: any
): Promise<object> {
  const dbg = kernel.dbg("http_server");
  dbg(opts.segments.join("/"));
  switch (opts.segments[0]) {
    case "signal":
      kernel.signal(opts.segments[1]);
      return {};

    case "kernel_info":
      return await kernel.kernel_info();

    case "more_output":
      return kernel.more_output(opts.query.id);

    case "complete":
      return await kernel.complete(get_code_and_cursor_pos(opts.query));

    case "introspect":
      const { code, cursor_pos } = get_code_and_cursor_pos(opts.query);
      let detail_level = 0;
      if (opts.query.level != null) {
        try {
          detail_level = parseInt(opts.query.level);
          if (detail_level < 0) {
            detail_level = 0;
          } else if (detail_level > 1) {
            detail_level = 1;
          }
        } catch (err) {}
      }
      return await kernel.introspect({
        code,
        cursor_pos,
        detail_level
      });

    case "store":
      let key, value;
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
      if (value == null) {
        return kernel.store.get(key);
      } else if (value === null) {
        kernel.store.delete(key);
        return {};
      } else {
        kernel.store.set(key, value);
        return {};
      }

    default:
      throw Error(`no route '${opts.segments.join("/")}'`);
  }
}

function jupyter_kernel_info_handler(base, router): void {
  router.get(base + "kernels.json", (req, res) =>
    get_kernel_data(function(err, kernel_data) {
      if (err) {
        res.send(err); // TODO: set some code
      } else {
        res.send(kernel_data.jupyter_kernels_json);
      }
    })
  );

  router.get(base + "kernelspecs/*", (req, res) =>
    get_kernel_data(function(err, kernel_data) {
      if (err) {
        res.send(err); // TODO: set some code
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
          res.send(`suspicious path '${path}'`);
        } else {
          fs.exists(path, function(exists) {
            if (!exists) {
              res.send(`no such path '${path}'`);
            } else {
              res.sendFile(path);
            }
          });
        }
      }
    })
  );
}

function jupyter_kernel_http_server(base, router): void {
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
    try {
      const resp = await handle_http_request(kernel, segments, req.query);
      res.send(JSON.stringify(resp));
    } catch (err) {
      res.send(JSON.stringify({ error: err }));
    }
  });
}

export function jupyter_router(express): any {
  // Install handling for the blob store
  let router = blob_store.express_router(BASE, express);

  // Handler for Jupyter kernel info
  jupyter_kernel_info_handler(base, router);

  // Handler for http messages for **specific kernels**
  jupyter_kernel_http_server(base, router);

  return router;
}
