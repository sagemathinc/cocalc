/*
HTTP server for getting various information from Jupyter, without
having to go through the websocket connection and messaging.  This is
useful, e.g., for big images, general info about all available
kernels, sending signals, doing tab completions, and so on.
*/

import { exists } from "./async-utils-node";
import { get_existing_kernel } from "./jupyter";
import { blob_store } from "./jupyter-blobs-sqlite";
import { get_kernel_data } from "./kernel-data";
import { startswith } from "../smc-webapp/frame-editors/generic/misc";

const BASE = "/.smc/jupyter/";

function get_code_and_cursor_pos(
  query: any
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
  dbg(segments.join("/"));
  switch (segments[0]) {
    case "signal":
      kernel.signal(segments[1]);
      return {};

    case "kernel_info":
      return await kernel.kernel_info();

    case "more_output":
      return kernel.more_output(query.id);

    case "complete":
      return await kernel.complete(get_code_and_cursor_pos(query));

    case "introspect":
      const { code, cursor_pos } = get_code_and_cursor_pos(query);
      let detail_level = 0;
      if (query.level != null) {
        try {
          detail_level = parseInt(query.level);
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
      if (query.key != null) {
        key = JSON.parse(query.key);
      } else {
        key = undefined;
      }
      if (query.value != null) {
        value = JSON.parse(query.value);
      } else {
        value = undefined;
      }
      if (value === undefined) {
        // undefined when getting the value
        return kernel.store.get(key);
      } else if (value === null) {
        // null is used for deleting the value
        kernel.store.delete(key);
        return {};
      } else {
        kernel.store.set(key, value);
        return {};
      }

    default:
      throw Error(`no route '${segments.join("/")}'`);
  }
}

function jupyter_kernel_info_handler(router): void {
  router.get(BASE + "kernels.json", async function(req, res): Promise<void> {
    try {
      res.send((await get_kernel_data()).jupyter_kernels_json);
    } catch (err) {
      res.send(err); // TODO: set some proper HTML error code
    }
  });

  router.get(BASE + "kernelspecs/*", async function(req, res): Promise<void> {
    try {
      const kernel_data = await get_kernel_data();
      let path = req.path.slice((BASE + "kernelspecs/").length).trim();
      if (path.length === 0) {
        res.send(kernel_data.jupyter_kernels_json);
        return;
      }
      const segments = path.split("/");
      const name = segments[0];
      const kernel = kernel_data.kernelspecs[name];
      if (kernel == null) {
        throw Error(`no such kernel '${name}'`);
      }
      // kernelspecs incorrectly calls it resources_dir instead of resource_dir.
      // See https://github.com/nteract/kernelspecs/issues/25
      const resource_dir =
        kernel.resource_dir != null
          ? kernel.resource_dir
          : kernel.resources_dir;
      path = require("path").join(resource_dir, segments.slice(1).join("/"));
      path = require("path").resolve(path);
      if (!startswith(path, resource_dir)) {
        // don't let user use .. or something to get any file on the server...!
        // (this really can't happen due to url rules already; just being super paranoid.)
        throw Error(`suspicious path '${path}'`);
      }
      if (await exists(path)) {
        res.sendFile(path);
      } else {
        throw Error(`no such path '${path}'`);
      }
    } catch (err) {
      res.send(err); // TODO: set some proper HTML error code
      return;
    }
  });
}

function jupyter_kernel_http_server(router): void {
  router.get(BASE + "kernels/*", async function(req, res): Promise<void> {
    let path: string = req.path.slice((BASE + "kernels/").length).trim();
    if (path.length === 0) {
      res.send((await get_kernel_data()).jupyter_kernels_json);
      return;
    }
    const segments = path.split("/");
    const kernel = get_existing_kernel(req.query.path);
    if (kernel == null) {
      res.send(
        JSON.stringify({ error: `no kernel with path '${req.query.path}'` })
      );
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
  const router = blob_store.express_router(BASE, express);

  // Handler for Jupyter kernel info
  jupyter_kernel_info_handler(router);

  // Handler for http messages for **specific kernels**
  jupyter_kernel_http_server(router);

  return router;
}
