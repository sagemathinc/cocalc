/**
 * Dev-only embedded project-host launcher.
 *
 * When COCALC_EMBEDDED_PROJECT_HOST is set (and not "0"), the hub process will spin up a
 * single project-host (with its own conat) in-process using local state under
 * data/embedded-project-host by default. This is meant to make local testing
 * trivial: hub + conat + one project-host all in one process. Not hardened for
 * production. Override defaults via COCALC_EMBEDDED_PROJECT_HOST_* env vars.
 */
import { mkdirSync } from "fs";
import { join } from "path";
import { data as dataDir } from "@cocalc/backend/data";
import port from "@cocalc/backend/port";
import { main as startEmbeddedProjectHost } from "@cocalc/project-host/main";
import { getLogger } from "../logger";

const logger = getLogger("hub:embedded-project-host");

function setDefaultEnv(key: string, value: string) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

export async function maybeStartEmbeddedProjectHost() {
  const flag = process.env.COCALC_EMBEDDED_PROJECT_HOST;
  if (!flag || flag === "0") {
    return;
  }
  logger.info("starting embedded project-host (dev mode)");
  const base =
    process.env.COCALC_EMBEDDED_PROJECT_HOST_DIR ||
    join(dataDir, "embedded-project-host");
  mkdirSync(base, { recursive: true });

  const mount = process.env.COCALC_FILE_SERVER_MOUNTPOINT || join(base, "mnt");
  mkdirSync(mount, { recursive: true });
  setDefaultEnv("COCALC_FILE_SERVER_MOUNTPOINT", mount);

  const sqlite =
    process.env.COCALC_LITE_SQLITE_FILENAME || join(base, "sqlite.db");
  setDefaultEnv("COCALC_LITE_SQLITE_FILENAME", sqlite);

  const rusticRoot = process.env.COCALC_RUSTIC || join(base, "rustic");
  mkdirSync(rusticRoot, { recursive: true });
  setDefaultEnv("COCALC_RUSTIC", rusticRoot);
  setDefaultEnv(
    "COCALC_RUSTIC_REPO",
    process.env.COCALC_RUSTIC_REPO || join(rusticRoot, "rustic"),
  );

  const logPath = process.env.DEBUG_FILE || join(base, "log");
  setDefaultEnv("DEBUG_FILE", logPath);
  setDefaultEnv("DEBUG", process.env.DEBUG || "cocalc:*");
  setDefaultEnv("DEBUG_CONSOLE", process.env.DEBUG_CONSOLE || "no");

  setDefaultEnv("COCALC_DISABLE_BEES", "yes");

  const basePort = Number(
    process.env.COCALC_EMBEDDED_PROJECT_HOST_PORT || "9100",
  );
  const host = process.env.COCALC_EMBEDDED_PROJECT_HOST_BIND || "127.0.0.1";
  setDefaultEnv("HOST", host);
  setDefaultEnv("PORT", String(basePort));

  const sshPort = Number(
    process.env.COCALC_EMBEDDED_PROJECT_HOST_SSH_PORT ||
      String(basePort + 1222),
  );
  setDefaultEnv("PROJECT_HOST_SSH_SERVER", `localhost:${sshPort}`);
  setDefaultEnv("COCALC_SSH_SERVER", `localhost:${sshPort}`);

  setDefaultEnv(
    "PROJECT_HOST_PUBLIC_URL",
    process.env.PROJECT_HOST_PUBLIC_URL || `http://localhost:${basePort}`,
  );
  setDefaultEnv(
    "PROJECT_HOST_INTERNAL_URL",
    process.env.PROJECT_HOST_INTERNAL_URL || `http://localhost:${basePort}`,
  );
  setDefaultEnv(
    "PROJECT_HOST_NAME",
    process.env.PROJECT_HOST_NAME || "embedded-host",
  );
  setDefaultEnv(
    "PROJECT_RUNNER_NAME",
    process.env.PROJECT_RUNNER_NAME || "embedded",
  );
  setDefaultEnv(
    "PROJECT_HOST_REGION",
    process.env.PROJECT_HOST_REGION || "local",
  );

  setDefaultEnv(
    "MASTER_CONAT_SERVER",
    process.env.MASTER_CONAT_SERVER || `http://localhost:${port}`,
  );
  await startEmbeddedProjectHost({
    embedded: true,
    hostId: process.env.PROJECT_HOST_ID,
    host,
    port: basePort,
  });
  logger.info("embedded project-host started", {
    url: process.env.PROJECT_HOST_PUBLIC_URL,
    mount,
    sqlite,
  });
}
