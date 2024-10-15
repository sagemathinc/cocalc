/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import express from "express";
import { createServer } from "http";
import { getLogger } from "@cocalc/backend/logger";
import type { Manager } from "./manager";

const logger = getLogger("compute:http-server");

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

  app.get("/", (_req, res) => {
    const files = manager.getOpenFiles();
    res.send(`<h1>Compute Server</h1>  Open Files: ${files.join(", ")}`);
  });

  server.listen(port, host, () => {
    logger.info(`Server listening http://${host}:${port}`);
  });
}
