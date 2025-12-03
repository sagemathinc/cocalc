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
import { initFileServer } from "./file-server";
import { initHttp, addCatchAll } from "./web";
import {
  upsertProject,
  listProjects,
  touchProject,
} from "./sqlite/projects";
import { initSqlite } from "./sqlite/init";
import { init as initChangefeeds } from "@cocalc/lite/hub/changefeeds";
import { init as initHubApi } from "@cocalc/lite/hub/api";
import { wireProjectsApi } from "./hub/projects";

const logger = getLogger("project-host:main");

export interface ProjectHostConfig {
  hostId?: string;
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
  const host = process.env.HOST ?? "0.0.0.0";
  const port = Number(process.env.PORT) || (await getPort());

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
  setConatServer(conatServer.address());
  const conatClient = conatServer.client({ path: "/" });
  setConatClient({
    conat: () => conatClient,
    getLogger,
  });

  // Local sqlite + changefeeds for UI data
  initSqlite();
  initChangefeeds({ client: conatClient });
  await initHubApi({ client: conatClient });

  // HTTP static + customize + API wiring
  await initHttp({ app, conatClient });

  // Minimal local persistence so DKV/state works (no external hub needed).
  const persistServer = createPersistServer({ client: conatClient });

  // 2) File-server (local btrfs + optional ssh proxy if enabled)
  await initFileServer({ client: conatClient });

  // 3) Project-runner bound to the same conat + file-server
  await initRunner({ id: runnerId, client: conatClient });
  const runnerApi = projectRunnerClient({
    client: conatClient,
    subject: `project-runner.${runnerId}`,
    waitForInterest: false,
  });
  wireProjectsApi(runnerApi);

  // 4) Minimal HTTP API
  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  app.get("/projects", (_req, res) => {
    res.json({ projects: listProjects() });
  });

  app.get("/projects/:id/status", async (req, res) => {
    const project_id = req.params.id;
    try {
      const status = await runnerApi.status({ project_id });
      touchProject(project_id, status.state);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  app.post("/projects/:id/start", async (req, res) => {
    const project_id = req.params.id;
    try {
      const status = await runnerApi.start({
        project_id,
        config: req.body?.config,
      });
      upsertProject({ project_id, state: status.state });
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  app.post("/projects/:id/stop", async (req, res) => {
    const project_id = req.params.id;
    try {
      const status = await runnerApi.stop({
        project_id,
        force: req.body?.force,
      });
      upsertProject({ project_id, state: status.state });
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? String(err) });
    }
  });

  addCatchAll(app);

  logger.info("project-host ready");

  const close = () => {
    persistServer?.close?.();
  };
  process.once("exit", close);
  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) =>
    process.once(sig, close),
  );

  return { port, host };
}

// Allow running directly via `node dist/main.js`.
if (require.main === module) {
  main().catch((err) => {
    console.error("project-host failed to start:", err);
    process.exitCode = 1;
  });
}
