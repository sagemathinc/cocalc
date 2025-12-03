import express from "express";
import { join } from "node:path";
import fs from "node:fs";
import { path as STATIC_PATH } from "@cocalc/static";
import { path as ASSET_PATH } from "@cocalc/assets";
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

  let pathToStaticAssets;
  if (fs.existsSync(join(STATIC_PATH, "app.html"))) {
    pathToStaticAssets = STATIC_PATH;
  } else {
    pathToStaticAssets = join(__dirname, "..", "static");
  }
  if (!fs.existsSync(join(pathToStaticAssets, "app.html"))) {
    throw Error("unable to find static assets");
  }
  app.use("/static", express.static(pathToStaticAssets));
  app.use(
    "/webapp/favicon.ico",
    express.static(join(ASSET_PATH, "favicon.ico")),
  );

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
    logger.debug("redirecting", req.url);
    const target = encodeURIComponent(req.originalUrl || req.url);
    res.redirect(`/static/app.html?target=${target}`);
  });
}
