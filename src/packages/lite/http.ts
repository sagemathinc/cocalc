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
import { join } from "path";
import initBlobUpload from "./hub/blobs/upload";
import initBlobDownload from "./hub/blobs/download";
import { account_id } from "@cocalc/backend/data";
import {
  FALLBACK_PROJECT_UUID,
  FALLBACK_ACCOUNT_UUID,
} from "@cocalc/util/misc";
import selfsigned from "selfsigned";
import fs from "node:fs";
import os from "node:os";
import { initAuth } from "./auth-token";

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

  app.use("/static", express.static(STATIC_PATH));

  app.use(
    "/webapp/favicon.ico",
    express.static(join(ASSET_PATH, "favicon.ico")),
  );

  app.get("/customize", async (_, res) => {
    res.json({
      configuration: {
        lite: true,
        site_name: "",
        project_id,
        account_id,
        compute_server_id,
        remote_sync: !!process.env.COMPUTE_SERVER,
      },
    });
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

function resolveCertDir(): string {
  if (process.env.SSL_DIR) {
    return process.env.SSL_DIR;
  }
  const home = os.homedir();
  // const platform = process.platform;
  //   if (platform === "win32") {
  //     const base = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
  //     return join(base, "CoCalcLite", "devcert");
  //   }
  // Linux/macOS (+others): prefer XDG config if set.
  const xdg = process.env.XDG_CONFIG_HOME || join(home, ".config");
  return join(xdg, "cocalc-lite", "devcert");
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function readIfExists(p: string): string | undefined {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
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

function getCertPaths(certDir: string, hostname: string) {
  const base = join(certDir, hostname);
  return {
    keyPath: base + ".key.pem",
    certPath: base + ".cert.pem",
  };
}

function getOrCreateSelfSigned(hostname: string) {
  const certDir = resolveCertDir();
  ensureDir(certDir);
  const { keyPath, certPath } = getCertPaths(certDir, hostname);

  let key = readIfExists(keyPath);
  let cert = readIfExists(certPath);

  if (!key || !cert) {
    // Generate a fresh self-signed cert; include SANs for common localhost usage.
    const attrs = [{ name: "commonName", value: hostname }];
    const pems = selfsigned.generate(attrs, {
      days: 365,
      keySize: 2048,
      algorithm: "sha256",
      extensions: [
        {
          name: "subjectAltName",
          altNames: [
            { type: 2, value: hostname }, // DNS
            { type: 2, value: "localhost" },
            { type: 7, ip: "127.0.0.1" },
            { type: 7, ip: "::1" },
          ],
        },
      ],
    });

    key = pems.private; // PEM string
    cert = pems.cert; // PEM string

    // Persist so we reuse next time.
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    fs.writeFileSync(certPath, cert, { mode: 0o644 });

    logger.info(`Generated new self-signed cert for ${hostname}`);
    logger.info(`Saved key:  ${keyPath}`);
    logger.info(`Saved cert: ${certPath}`);
  }

  return { key, cert, keyPath, certPath, certDir };
}

function showURL({ url, AUTH_TOKEN }) {
  const auth = AUTH_TOKEN
    ? `?auth_token=${encodeURIComponent(AUTH_TOKEN)}`
    : "";
  console.log("*".repeat(60) + "\n");
  console.log(`CoCalc Lite Server:  ${url}${auth}`);
}
