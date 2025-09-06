/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Application } from "express";

import base_path from "@cocalc/backend/base-path";
import { ProjectControlFunction } from "@cocalc/server/projects/control";
import getLogger from "../logger";
import initRequest from "./handle-request";
import initUpgrade from "./handle-upgrade";

const logger = getLogger("proxy");

interface Options {
  app: Application;
  httpServer; // got from express_app via httpServer = http.createServer(app).
  projectControl: ProjectControlFunction; // controls projects (aka "compute server")
  isPersonal: boolean; // if true, disables all access controls
  proxyConat: boolean;
}

// UUID regex pattern for project ID validation
const UUID_REGEX =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

/**
 * Middleware to validate that the project_id route parameter is a valid UUID.
 * If valid, continues to next middleware. If invalid, skips to next route.
 */
function uuidMiddleware(req, _res, next) {
  if (UUID_REGEX.test(req.params.project_id)) {
    return next();
  }
  // Not a valid project ID UUID: skip to next route
  return next("route");
}

export default function initProxy(opts: Options) {
  const prefix = base_path.length <= 1 ? "" : base_path;
  const routePath = `${prefix}/:project_id/{*splat}`;
  logger.info("creating proxy server with route pattern", routePath);

  const handleProxy = initRequest(opts);

  // Create regex for upgrade handler (still needed for WebSocket matching)
  const proxy_regexp = `^${prefix}\/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\/.*`;
  const handleUpgrade = initUpgrade(opts, proxy_regexp);

  // Use Express 5 path syntax with UUID validation middleware
  opts.app.all(routePath, uuidMiddleware, handleProxy);

  opts.httpServer.on("upgrade", handleUpgrade);
}
