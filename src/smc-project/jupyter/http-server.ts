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

import * as os_path from "path";
import { Router } from "express";
import { exists } from "./async-utils-node";
import { blob_store } from "./jupyter-blobs-sqlite";
import { get_kernel_data } from "./kernel-data";
import { startswith } from "smc-util/misc";

const BASE = "/.smc/jupyter/";

function get_kernel(kernel_data, name) {
  for (const k of kernel_data) {
    if (k.name == name) return k;
  }
  return null;
}

function jupyter_kernel_info_handler(router): void {
  // we are only actually using this to serve up the logo.
  router.get(BASE + "kernelspecs/*", async function (req, res): Promise<void> {
    try {
      const kernel_data = await get_kernel_data();
      let path = req.path.slice((BASE + "kernelspecs/").length).trim();
      if (path.length === 0) {
        res.json(kernel_data);
        return;
      }
      const segments = path.split("/");
      const name = segments[0];
      const kernel = get_kernel(kernel_data, name);
      if (kernel == null) {
        const msg = `no such kernel '${name}'`;
        throw Error(msg);
      }
      const resource_dir = kernel.resource_dir;
      path = os_path.join(resource_dir, segments.slice(1).join("/"));
      path = os_path.resolve(path);

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

export default function init(): Router {
  // Install handling for the blob store
  const router: Router = blob_store.express_router(BASE);

  // Handler for Jupyter kernel info
  jupyter_kernel_info_handler(router);

  return router;
}
