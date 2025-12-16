/**
 * Minimal project-host: spins up a local conat server, embeds the file-server
 * and project-runner, and exposes a tiny HTTP API to start/stop/status projects.
 *
 * Security: intentionally insecure for now. No auth, no TLS.
 */
import { createServer as createHttpServer } from "http";
import { once } from "node:events";
import express from "express";
import getPort from "@cocalc/backend/get-port";
import getLogger from "@cocalc/backend/logger";
import { account_id, setConatServer } from "@cocalc/backend/data";
import {
  init as createConatServer,
  type ConatServer,
} from "@cocalc/conat/core/server";
import { setConatClient } from "@cocalc/conat/client";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { init as initRunner } from "@cocalc/project-runner/run";
import { client as projectRunnerClient } from "@cocalc/conat/project/runner/run";
import { initFileServer, initFsServer } from "./file-server";
import { initHttp, addCatchAll } from "./web";
import { initSqlite } from "./sqlite/init";
import { getProjectPorts } from "./sqlite/projects";
import { attachProjectProxy } from "@cocalc/project-proxy/proxy";
import { init as initChangefeeds } from "@cocalc/lite/hub/changefeeds";
import { init as initHubApi } from "@cocalc/lite/hub/api";
import { wireProjectsApi } from "./hub/projects";
import { startMasterRegistration } from "./master";
import { startReconciler } from "./reconcile";
import { init as initAcp } from "@cocalc/lite/hub/acp";
import { setContainerExec } from "@cocalc/lite/hub/acp/executor/container";
import { setPreferContainerExecutor } from "@cocalc/lite/hub/acp/workspace-root";
import { sandboxExec } from "@cocalc/project-runner/run/sandbox-exec";

const logger = getLogger("project-host:main");

export interface ProjectHostConfig {
  hostId?: string;
  host?: string;
  port?: number;
}

export interface ProjectHostContext {
  port: number;
  host: string;
}

async function startHttpServer(port: number, host: string) {
  const app = express();
  app.use(express.json());

  const httpServer = createHttpServer(app);
  httpServer.listen(port, host);
  await once(httpServer, "listening");

  return { app, httpServer };
}

export async function main(
  _config: ProjectHostConfig = {},
): Promise<ProjectHostContext> {
  const runnerId = process.env.PROJECT_RUNNER_NAME || "project-host";
  const host = _config.host ?? process.env.HOST ?? "0.0.0.0";
  const port = _config.port ?? (Number(process.env.PORT) || (await getPort()));

  logger.info(`starting project-host on ${host}:${port} (runner=${runnerId})`);

  // 1) HTTP + conat server
  const { app, httpServer } = await startHttpServer(port, host);
  const conatServer: ConatServer = createConatServer({
    httpServer,
    ssl: false,
    port,
    getUser: async () => ({ account_id }),
  });
  if (conatServer.state !== "ready") {
    await once(conatServer, "ready");
  }
  const conatClient = conatServer.client({ path: "/" });
  setConatServer(conatServer.address());
  setConatClient({
    conat: () => conatClient,
    getLogger,
  });

  logger.info("Local sqlite + changefeeds for UI data");
  initSqlite();
  initChangefeeds({ client: conatClient });
  await initHubApi({ client: conatClient });

  // ACP runs inside project-host in container mode (no env flag needed).
  setPreferContainerExecutor(true);
  // Use the in-host podman exec helper for ACP container execution.
  setContainerExec(sandboxExec);
  await initAcp(conatClient);

  // Minimal local persistence so DKV/state works (no external hub needed).
  const persistServer = createPersistServer({ client: conatClient });

  logger.info("File-server (local btrfs + optional ssh proxy if enabled)");
  try {
    await initFileServer({ client: conatClient });
  } catch (err) {
    logger.error("FATAL: Failed to init file server", err);
    process.exit(1);
  }

  logger.info("Proxy HTTP/WS traffic to running project containers.");
  attachProjectProxy({
    httpServer,
    app,
    resolveTarget: (req) => {
      const project_id = req.url?.split("/")[1];
      if (!project_id) return { handled: false };
      const { http_port } = getProjectPorts(project_id);
      if (!http_port) {
        throw new Error(`no http_port recorded for project ${project_id}`);
      }
      return { handled: true, target: { host: "127.0.0.1", port: http_port } };
    },
  });

  logger.info(
    "Serve per-project files via the fs.* conat service, mounting from the local file-server.",
  );
  const fsServer = await initFsServer({ client: conatClient });

  logger.info("HTTP static + customize + API wiring");
  await initHttp({ app, conatClient });

  logger.info("Project-runner bound to the same conat + file-server");
  await initRunner({ id: runnerId, client: conatClient });
  const runnerApi = projectRunnerClient({
    client: conatClient,
    subject: `project-runner.${runnerId}`,
    waitForInterest: false,
  });
  wireProjectsApi(runnerApi);

  logger.info("Minimal HTTP API");
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  addCatchAll(app);

  logger.info("start Master Registration");
  const stopMasterRegistration = await startMasterRegistration({
    hostId: _config.hostId ?? process.env.PROJECT_HOST_ID,
    runnerId,
    host,
    port,
  });
  const stopReconciler = startReconciler();

  logger.info("project-host ready");

  const close = () => {
    persistServer?.close?.();
    fsServer?.close?.();
    stopMasterRegistration?.();
    stopReconciler?.();
  };
  process.once("exit", close);
  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => process.once(sig, close));

  return { port, host };
}

// Allow running directly via `node dist/main.js`.
if (require.main === module) {
  main().catch((err) => {
    console.error("project-host failed to start:", err);
    process.exitCode = 1;
  });
}
