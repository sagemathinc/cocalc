import express, { type Application } from "express";
import { path as STATIC_PATH } from "@cocalc/static";
import { path as ASSET_PATH } from "@cocalc/assets";
import getPort from "@cocalc/backend/get-port";
import {
  createServer as httpCreateServer,
  type Server as HTTPServer,
} from "http";
import {
  createServer as httpsCreateServer,
  type Server as HTTPSServer,
} from "https";
import getLogger from "@cocalc/backend/logger";
import port0 from "@cocalc/backend/port";
import { once } from "node:events";
import { project_id, compute_server_id } from "@cocalc/project/data";
import { handleFileDownload } from "@cocalc/conat/files/file-download";
import { join } from "node:path";
import initBlobUpload from "./hub/blobs/upload";
import initBlobDownload from "./hub/blobs/download";
import { account_id } from "@cocalc/backend/data";
import {
  FALLBACK_PROJECT_UUID,
  FALLBACK_ACCOUNT_UUID,
} from "@cocalc/util/misc";
import fs from "node:fs";
import { initAuth } from "./auth-token";
import { hasRemote } from "./remote";
import { getCustomizePayload } from "./hub/settings";
import { getOrCreateSelfSigned } from "./tls";

const logger = getLogger("lite:static");

type AnyServer = HTTPServer | HTTPSServer;

export async function initHttpServer({ AUTH_TOKEN }): Promise<{
  httpServer: ReturnType<typeof httpCreateServer>;
  app: Application;
  port: number;
  isHttps: boolean;
}> {
  const app = express();

  const port = port0 ?? (await getPort());
  const hostEnv = process.env.HOST ?? "localhost";
  const { isHttps, hostname } = sanitizeHost(hostEnv);
  let httpServer: AnyServer;

  if (isHttps) {
    const { key, cert, keyPath, certPath } = getOrCreateSelfSigned(hostname);
    httpServer = httpsCreateServer({ key, cert }, app);
    httpServer.on("error", (err: any) => {
      logger.error(
        "*".repeat(60) +
          `\nWARNING -- hub https server error: ${err.stack || err}\n` +
          "*".repeat(60),
      );
      if (err?.code === "EADDRINUSE" || err?.code === "EACCES") {
        console.log(err);
        process.exit(1);
      }
    });

    httpServer.listen(port, hostname);
    await once(httpServer, "listening");

    showURL({ url: `https://${hostname}:${port}`, AUTH_TOKEN });
    console.log(`TLS: key=${keyPath}\n     cert=${certPath}`);
  } else {
    httpServer = httpCreateServer(app);
    httpServer.on("error", (err: any) => {
      logger.error(
        "*".repeat(60) +
          `\nWARNING -- hub http server error: ${err.stack || err}\n` +
          "*".repeat(60),
      );
      if (err?.code === "EADDRINUSE" || err?.code === "EACCES") {
        console.log(err);
        process.exit(1);
      }
    });

    httpServer.listen(port, hostname);
    await once(httpServer, "listening");
    showURL({ url: `http://${hostname}:${port}`, AUTH_TOKEN });
  }

  const info: any = {};
  if (project_id != FALLBACK_PROJECT_UUID) {
    info.project_id = project_id;
  }
  if (account_id != FALLBACK_ACCOUNT_UUID) {
    info.account_id = account_id;
  }
  if (compute_server_id) {
    info.compute_server_id = compute_server_id;
  }
  if (Object.keys(info).length > 0) {
    console.log(JSON.stringify(info, undefined, 2));
  }
  console.log("\n" + "*".repeat(60));
  return { httpServer, app, port, isHttps };
}

export async function initApp({ app, conatClient, AUTH_TOKEN, isHttps }) {
  initAuth({ app, AUTH_TOKEN, isHttps });

  let pathToStaticAssets;
  if (fs.existsSync(join(STATIC_PATH, "app.html"))) {
    pathToStaticAssets = STATIC_PATH;
  } else {
    pathToStaticAssets = join(__dirname, "..", "static");
  }
  if (!fs.existsSync(join(pathToStaticAssets, "app.html"))) {
    throw Error("unable to find static assets");
  }

  // Ensure we are in a secure, cross-origin isolated context (COOP/COEP).
  // This will break Any cross-origin <script>, <img>, <iframe>, WASM, etc.
  // that is not served properly.
  app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });

  app.use("/static", express.static(pathToStaticAssets));

  app.use(
    "/webapp/favicon.ico",
    express.static(join(ASSET_PATH, "favicon.ico")),
  );

  app.get("/customize", async (_, res) => {
    const payload = await getCustomizePayload();
    payload.configuration.project_id = project_id;
    payload.configuration.account_id = account_id;
    payload.configuration.compute_server_id = compute_server_id;
    payload.configuration.remote_sync = hasRemote;
    res.json(payload);
  });

  // file download
  app.get(`/${project_id}/files/*`, async (req, res) => {
    await handleFileDownload({ req, res });
  });

  initBlobUpload(app, conatClient);
  initBlobDownload(app, conatClient);

  app.get("*", (req, res) => {
    if (req.url.endsWith("__webpack_hmr")) return;
    logger.debug("redirecting", req.url);
    res.redirect("/static/app.html");
  });
}

function sanitizeHost(rawHost: string): { isHttps: boolean; hostname: string } {
  // Accept: "localhost", "0.0.0.0", "https://localhost", etc.
  const trimmed = rawHost.trim();
  const isHttps = trimmed.startsWith("https://");
  if (isHttps) {
    const u = new URL(trimmed);
    return { isHttps: true, hostname: u.hostname };
  } else if (trimmed.startsWith("http://")) {
    const u = new URL(trimmed);
    return { isHttps: false, hostname: u.hostname };
  }
  return { isHttps: false, hostname: trimmed };
}

function showURL({ url, AUTH_TOKEN }) {
  const auth = AUTH_TOKEN
    ? `?auth_token=${encodeURIComponent(AUTH_TOKEN)}`
    : "";
  console.log("*".repeat(60) + "\n");
  console.log(`CoCalc Lite Server:  ${url}${auth}`);
}
