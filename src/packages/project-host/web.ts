import express from "express";
import getLogger from "@cocalc/backend/logger";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { account_id } from "@cocalc/backend/data";
import compression from "compression";

const logger = getLogger("project-host:web");

const DEFAULT_CONFIGURATION = {
  lite: false,
  project_host: true,
  site_name: "CoCalc Project Host",
  compute_servers_enabled: false,
  anonymous_signup: true,
};

export async function initHttp({
  app,
  conatClient: _, // reserved for future use
}: {
  app: express.Application;
  conatClient: ConatClient;
}) {
  app.use(compression());

  app.get("/customize", async (_req, res) => {
    res.json({
      configuration: {
        ...DEFAULT_CONFIGURATION,
        account_id,
      },
      registration: false,
      strategies: [],
      software: null,
      ollama: {},
      custom_openai: {},
    });
  });
}

export function addCatchAll(app: express.Application) {
  app.get("*", (req, res) => {
    if (req.url.endsWith("__webpack_hmr")) return;
    logger.debug("no static frontend available for", req.url);
    res.status(404).json({
      error: "Not Found",
      detail: "Static assets are not served from project-host.",
    });
  });
}
