/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import compression from "compression";
import express from "express";
import { createServer } from "http";
import { getLogger } from "@cocalc/backend/logger";
import type { Manager } from "./manager";
import { path as STATIC_PATH } from "@cocalc/static";
import { join } from "path";
import { cacheShortTerm, cacheLongTerm } from "@cocalc/util/http-caching";

const logger = getLogger("compute:http-server");

const ENTRY_POINT = "compute.html";

export function initHttpServer({
  port = 5004,
  host = "localhost",
  manager,
}: {
  port?: number;
  host?: string;
  manager: Manager;
}) {
  logger.info("starting http-server...");

  const app = express();
  const server = createServer(app);

  app.use(compression());

  app.get("/", (_req, res) => {
    const files = manager.getOpenFiles();
    res.send(
      `<h1>Compute Server</h1>  <a href="${join("/static", ENTRY_POINT)}">CoCalc App</a> <br/><br/> Open Files: ${files.join(", ")}`,
    );
  });

  app.get("/settings", (_req, res) => {
    res.send(`<h1><a href="${join("/static", ENTRY_POINT)}">CoCalc App</a>`);
  });

  app.use(
    join("/static", ENTRY_POINT),
    express.static(join(STATIC_PATH, ENTRY_POINT), {
      setHeaders: cacheShortTerm,
    }),
  );
  app.use(
    "/static",
    express.static(STATIC_PATH, { setHeaders: cacheLongTerm }),
  );

  app.get("/customize", (_req, res) => {
    res.json({
      configuration: {
        compute_server: { project_id: manager.project_id },
      },
      registration: false,
    });
  });

  server.listen(port, host, () => {
    logger.info(`Server listening http://${host}:${port}`);
  });
}
