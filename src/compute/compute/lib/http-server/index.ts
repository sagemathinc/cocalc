/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import compression from "compression";
import express from "express";
import { createServer } from "http";
import { getLogger } from "../logger";
import type { Manager } from "../manager";
import { path as STATIC_PATH } from "@cocalc/static";
import { join } from "path";
import { cacheShortTerm, cacheLongTerm } from "@cocalc/util/http-caching";
import initWebsocket from "./websocket";

const logger = getLogger("http-server");

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

  // this is expected by the frontend code for where to find the project.
  const projectBase = `/${manager.project_id}/raw/`;
  logger.info({ projectBase });

  app.use(projectBase, initWebsocket(server, projectBase));

  // CRITICAL: compression must be after websocket above!
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
    `/static/${ENTRY_POINT}`,
    express.static(`/${STATIC_PATH}/${ENTRY_POINT}`, {
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
