const { existsSync } = require("fs");
const { join } = require("path");

function parsePort(value) {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function resolveDataDir() {
  if (process.env.COCALC_DATA_DIR) {
    return process.env.COCALC_DATA_DIR;
  }
  if (process.env.DATA) {
    return process.env.DATA;
  }
  const home = process.env.HOME ?? process.cwd();
  const legacy = join(home, ".local", "share", "cocalc-launchpad");
  if (existsSync(legacy)) {
    return legacy;
  }
  return join(home, ".local", "share", "cocalc", "launchpad");
}

function applyLaunchpadDefaults() {
  process.env.COCALC_DB ??= "pglite";
  process.env.COCALC_DISABLE_NEXT ??= "1";
  process.env.COCALC_MODE ??= "launchpad";

  const dataDir = resolveDataDir();
  process.env.DATA ??= dataDir;
  process.env.COCALC_DATA_DIR ??= process.env.DATA;
  process.env.COCALC_PGLITE_DATA_DIR ??= join(process.env.DATA, "pglite");

  const basePort =
    parsePort(process.env.COCALC_BASE_PORT) ??
    parsePort(process.env.COCALC_HTTPS_PORT) ??
    parsePort(process.env.PORT) ??
    8443;
  const httpsPort = parsePort(process.env.COCALC_HTTPS_PORT) ?? basePort;

  process.env.COCALC_HTTPS_PORT ??= String(httpsPort);
  process.env.PORT ??= String(httpsPort);
  process.env.COCALC_HTTP_PORT ??= String(Math.max(basePort - 1, 1));
  process.env.COCALC_SSHD_PORT ??= String(basePort + 1);
  process.env.COCALC_SSHPIPERD_PORT ??= String(basePort + 2);
}

module.exports = {
  applyLaunchpadDefaults,
  logLaunchpadConfig() {
    const summary = {
      data_dir: process.env.COCALC_DATA_DIR ?? process.env.DATA,
      https_port: process.env.COCALC_HTTPS_PORT ?? process.env.PORT,
      http_port: process.env.COCALC_HTTP_PORT,
      sshd_port: process.env.COCALC_SSHD_PORT,
      sshpiperd_port: process.env.COCALC_SSHPIPERD_PORT,
    };
    console.log("launchpad config:", summary);
  },
};
