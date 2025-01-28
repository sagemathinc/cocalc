/*
Ensure installed specific correct versions of the following
three GO programs in {data}/nats/bin on this server, correct
for this architecture:

 - nats
 - nats-server
 - nsc

We assume curl and python3 are installed.
*/

import { nats } from "@cocalc/backend/data";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { pathExists } from "fs-extra";
import { executeCode } from "@cocalc/backend/execute-code";

const VERSIONS = {
  "nats-server": "v2.11.0-preview.2",
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
    installNsc(noUpgrade),
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

async function installNatsServer(noUpgrade) {
  if (noUpgrade && (await pathExists(join(bin, "nats-server")))) {
    return;
  }
  if ((await getVersion("nats-server")) == VERSIONS["nats-server"]) {
    logger.debug(
      `nats-server version ${VERSIONS["nats-server"]} already installed`,
    );
    return;
  }
  logger.debug("installing nats-server");
  await executeCode({
    command: `curl -sf https://binaries.nats.dev/nats-io/nats-server/v2@${VERSIONS["nats-server"]} | sh`,
    path: bin,
    verbose: true,
  });
}

export async function installNsc(noUpgrade) {
  const nsc = join(bin, "nsc");
  if (noUpgrade && (await pathExists(nsc))) {
    return;
  }

  if (!(await pathExists(nsc))) {
    await executeCode({
      command: `curl -LO https://raw.githubusercontent.com/nats-io/nsc/main/install.py`,
      path: bin,
      verbose: true,
    });
    const { stdout } = await executeCode({
      path: bin,
      env: { PYTHONDONTWRITEBYTECODE: 1 },
      command:
        "python3 -c 'import os, sys; sys.path.insert(0,\".\"); import install; print(install.release_url(sys.platform, os.uname()[4], sys.argv[1] if len(sys.argv) > 1 else None))'",
    });
    await executeCode({
      command: `curl -sL ${stdout.trim()} -o nsc.zip && unzip nsc.zip -d . && rm nsc.zip install.py`,
      path: bin,
      verbose: true,
    });
  } else {
    await executeCode({
      command: nsc,
      args: ["update"],
      path: bin,
      verbose: true,
    });
  }
}

async function installNatsCli(noUpgrade) {
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
