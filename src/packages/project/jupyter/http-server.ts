/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
HTTP server for getting various information from Jupyter, without
having to go through the websocket connection and messaging.  This is
useful, e.g., for big images, general info about all available
kernels, sending signals, doing tab completions, and so on.
*/

import { Router } from "express";
import getLogger from "@cocalc/backend/logger";
import { get_existing_kernel } from "@cocalc/jupyter/kernel";

const log = getLogger("jupyter-http-server");

const BASE = "/.smc/jupyter/";

function jupyter_kernel_info_handler(router): void {
  router.get(
    BASE + "ipywidgets-get-buffer",
    async function (req, res): Promise<void> {
      try {
        const { path, model_id, buffer_path } = req.query;
        const kernel = get_existing_kernel(path);
        if (kernel == null) {
          res.status(404).send(`kernel associated to ${path} does not exist`);
          return;
        }
        const buffer = kernel.ipywidgetsGetBuffer(model_id, buffer_path);
        if (buffer == null) {
          res
            .status(404)
            .send(
              `buffer associated to model ${model_id} at ${buffer_path} not known`,
            );
          return;
        }
        res.status(200).send(buffer);
      } catch (err) {
        res.status(500).send(`Error getting ipywidgets buffer - ${err}`);
      }
    },
  );
}

export default async function init(): Promise<Router> {
  log.debug("setup jupyter http server");
  const router = Router();

  // Handler for Jupyter kernel info
  jupyter_kernel_info_handler(router);

  return router;
}
