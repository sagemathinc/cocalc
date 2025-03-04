/*
Configure nats-server, i.e., generate configuration files.

node -e "require('@cocalc/backend/nats/conf').main()"

*/

import { pathExists } from "fs-extra";
import { data, nats, natsPorts, natsServer } from "@cocalc/backend/data";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { writeFile } from "fs/promises";
import { NATS_JWT_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import nsc from "./nsc";
import { executeCode } from "@cocalc/backend/execute-code";
import { startServer } from "./server";
import { kill } from "node:process";
import { delay } from "awaiting";

const logger = getLogger("backend:nats:install");

// this is assumed in cocalc/src/package.json:
const confPath = join(nats, "server.conf");

// for now for local dev:
export const natsServerUrl = `nats://${natsServer}:${natsPorts.server}`;
export const natsAccountName = "cocalc";

export async function configureNatsServer() {
  logger.debug("configureNatsServer", { confPath });
  if (await pathExists(confPath)) {
    logger.debug(
      `configureNatsServer: target conf file '${confPath}' already exists so not doing anything`,
    );
    return;
  }

  await writeFile(
    confPath,
    `
listen: ${natsServer}:${natsPorts.server}

jetstream: enabled

jetstream {
  store_dir: data/nats/jetstream
}

websocket {
    listen: "${natsServer}:${natsPorts.ws}"
    no_tls: true
    jwt_cookie: "${NATS_JWT_COOKIE_NAME}"
}

resolver {
    type: full
    dir: 'data/nats/jwt'
    allow_delete: true
    interval: "1m"
    timeout: "3s"
}

${await configureNsc()}
`,
  );

  const pid = startServer();
  let d = 1000;
  while (true) {
    try {
      // push initial operator/account/user configuration so its possible
      // to configure other accounts
      await nsc(["push", "-u", natsServerUrl]);
      break;
    } catch (err) {
      console.log(err);
      await delay(d);
      d = Math.min(15000, d * 1.3);
    }
  }
  kill(pid);
}

export async function configureNsc() {
  // initialize the local nsc account config
  await nsc(["init", "--name", natsAccountName]);
  // set the url for the operat
  await nsc(["edit", "operator", "--account-jwt-server-url", natsServerUrl]);
  // make cocalc user able to pub and sub to everything
  await nsc(["edit", "user", "--name", "cocalc", "--allow-pubsub", ">"]);
  // enable jetstream for the cocalc account
  await nsc(["edit", "account", "--js-mem-storage=-1", "--js-disk-storage=-1"]);
  // set nats default context to cocalc user, so using the nats cli works.
  await executeCode({
    command: join(nats, "bin", "nats"),
    args: [
      "context",
      "save",
      "--select",
      "--nsc=nsc://cocalc/cocalc/cocalc",
      "cocalc",
    ],
    env: {
      XDG_DATA_HOME: data,
      XDG_CONFIG_HOME: data,
      PATH: `${join(nats, "bin")}:${process.env.PATH}`,
    },
    verbose: true,
  });

  // return the operator and system_account for inclusion in server config
  const { stdout } = await nsc(["generate", "config", "--nats-resolver"]);
  const i = stdout.indexOf("system_account");
  const j = stdout.indexOf("\n", i + 1);
  return stdout.slice(0, j);
}

export async function main() {
  await configureNatsServer();
  process.exit(0);
}
