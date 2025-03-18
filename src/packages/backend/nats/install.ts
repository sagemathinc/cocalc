/*
Ensure installed specific correct versions of the following
three GO programs in {data}/nats/bin on this server, correct
for this architecture:

 - nats
 - nats-server

We assume curl and python3 are installed.

DEVELOPMENT:

Installation happens automatically, e.g,. when you do 'pnpm nats-server' or
start the hub via 'pnpm hub'.   However, you can explicitly do
an install as follows:

~/cocalc/src/packages/backend/nats$ DEBUG=cocalc:* DEBUG_CONSOLE=yes node
Welcome to Node.js v18.17.1.
Type ".help" for more information.

Install latest tested version of nats-server and nats cli:

    > await require('@cocalc/backend/nats/install').install()

Installing just the server:

    > await require('@cocalc/backend/nats/install').installNatsServer()
*/

import { nats } from "@cocalc/backend/data";
import { join } from "path";
import { pathExists } from "fs-extra";
import { executeCode } from "@cocalc/backend/execute-code";
import getLogger from "@cocalc/backend/logger";

const VERSIONS = {
  // https://github.com/nats-io/nats-server/releases
  "nats-server": "v2.11.0-RC.4",
  // https://github.com/nats-io/natscli/releases
  nats: "v0.1.6",
};

export const bin = join(nats, "bin");
const logger = getLogger("backend:nats:install");

export async function install(noUpgrade = false) {
  logger.debug("ensure nats binaries installed in ", bin);

  if (!(await pathExists(bin))) {
    await executeCode({ command: "mkdir", args: ["-p", bin] });
  }

  await Promise.all([
    installNatsServer(noUpgrade),
    installNatsCli(noUpgrade),
  ]);
}

// call often, but runs at most once and ONLY does something if
// there is no binary i.e., it doesn't upgrade.
let installed = false;
export async function ensureInstalled() {
  if (installed) {
    return;
  }
  installed = true;
  await install(true);
}

async function getVersion(name: string) {
  try {
    const { stdout } = await executeCode({
      command: join(bin, name),
      args: ["--version"],
    });
    const v = stdout.trim().split(/\s/g);
    return v[v.length - 1];
  } catch {
    return "";
  }
}

export async function installNatsServer(noUpgrade) {
  if (noUpgrade && (await pathExists(join(bin, "nats-server")))) {
    return;
  }
  if ((await getVersion("nats-server")) == VERSIONS["nats-server"]) {
    logger.debug(
      `nats-server version ${VERSIONS["nats-server"]} already installed`,
    );
    return;
  }
  const command = `curl -sf https://binaries.nats.dev/nats-io/nats-server/v2@${VERSIONS["nats-server"]} | sh`;
  logger.debug("installing nats-server: ", command);
  await executeCode({
    command,
    path: bin,
    verbose: true,
  });
}

export async function installNatsCli(noUpgrade) {
  if (noUpgrade && (await pathExists(join(bin, "nats")))) {
    return;
  }
  if ((await getVersion("nats")) == VERSIONS["nats"]) {
    logger.debug(`nats version ${VERSIONS["nats"]} already installed`);
    return;
  }
  logger.debug("installing nats cli");
  await executeCode({
    command: `curl -sf https://binaries.nats.dev/nats-io/natscli/nats@${VERSIONS["nats"]} | sh`,
    path: bin,
    verbose: true,
  });
}


export async function main() {
  await install();
  process.exit(0);
}
