/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
HTTP server for getting various information from Jupyter, without
having to go through the websocket connection and messaging.  This is
useful, e.g., for big images, general info about all available
kernels, sending signals, doing tab completions, and so on.
*/

import { exists } from "./async-utils-node";
import { blob_store } from "./jupyter-blobs-sqlite";
import { get_kernel_data } from "./kernel-data";
import { startswith } from "../smc-util/misc2";

const BASE = "/.smc/jupyter/";

function jupyter_kernel_info_handler(router): void {
  // we are only actually using this to serve up the logo.
  router.get(BASE + "kernelspecs/*", async function (req, res): Promise<void> {
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

export function jupyter_router(express): any {
  // Install handling for the blob store
  const router = blob_store.express_router(BASE, express);

  // Handler for Jupyter kernel info
  jupyter_kernel_info_handler(router);

  return router;
}
