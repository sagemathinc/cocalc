/*
HTTP Next API

- this is whatever we need from cocalc/src/packages/next/pages/api/v2 specifically
  for working with one project.

*/

import { get_kernel_data } from "@cocalc/jupyter/kernel/kernel-data";
import { Router } from "express";
import { getLogger } from "../logger";
import type { Manager } from "../manager";

const logger = getLogger("http-next-api");

export default function initHttpNextApi({ manager }: { manager }): Router {
  logger.info("initHttpNextApi");
  const router = Router();

  for (const path in HANDLERS) {
    router.post("/" + path, handler(manager, HANDLERS[path]));
    router.get("/" + path, handler(manager, HANDLERS[path]));
  }

  router.post("*", (req, res) => {
    res.json({ error: `api endpoint '${req.path}' is not implemented` });
  });
  router.get("*", (req, res) => {
    res.json({ error: `api endpoint '${req.path}' is not implemented` });
  });

  return router;
}

function handler(
  manager,
  f: (x: { req; res; manager: Manager }) => Promise<object>,
) {
  return async (req, res) => {
    try {
      res.json({ success: true, ...(await f({ req, res, manager })) });
    } catch (err) {
      res.json({ error: `${err}` });
    }
  };
}

const HANDLERS = {
  "jupyter/kernels": async () => {
    return { kernels: await get_kernel_data() };
  },
};
