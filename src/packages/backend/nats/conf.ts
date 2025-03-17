/*
Configure nats-server, i.e., generate configuration files.

node -e "require('@cocalc/backend/nats/conf').main()"



NOTES:

- I tried very hard to use NKEYS and/or JWT, but it's
just not compatible with auth callout, and auth callout
is required for scalability, given my use case. That's
why there is an explicit password.
*/

import { pathExists } from "fs-extra";
import {
  data,
  nats,
  natsPorts,
  natsServer,
  natsPassword,
  natsUser,
} from "@cocalc/backend/data";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { writeFile } from "fs/promises";
import { REMEMBER_ME_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import nsc from "./nsc";
import { executeCode } from "@cocalc/backend/execute-code";
// import { startServer } from "./server";
// import { kill } from "node:process";
// import { delay } from "awaiting";

const logger = getLogger("backend:nats:install");

// this is assumed in cocalc/src/package.json:
const confPath = join(nats, "server.conf");

// for now for local dev:
export const natsServerUrl = `nats://${natsServer}:${natsPorts.server}`;
export const natsAccountName = "cocalc";

// I tested and if you make this bigger, then smaller, it does NOT break
// large jetstream messages created when it was bigger.  So it should be
// safe to adjust.
const max_payload = "1MB";

// Use hardcoded issuer Nkey and Xkey for initial DEVELOPMENT ONLY of auth callout!
export const ISSUER_NKEY =
  "ABJHLOVMPA4CI6R5KLNGOB4GSLNIY7IOUPAJC4YFNDLQVIOBYQGUWVLA";
export const ISSUER_NSEED =
  "SAANDLKMXL6CUS3CP52WIXBEDN6YJ545GDKC65U5JZPPV6WH6ESWUA6YAI";

export const ISSUER_XKEY =
  "XAB3NANV3M6N7AHSQP2U5FRWKKUT7EG2ZXXABV4XVXYQRJGM4S2CZGHT";
export const ISSUER_XSEED =
  "SXAAXMRAEP6JWWHNB6IKFL554IE6LZVT6EY5MBRICPILTLOPHAG73I3YX4";

export async function configureNatsServer() {
  logger.debug("configureNatsServer", { confPath, natsPorts });
  if (await pathExists(confPath)) {
    logger.debug(
      `configureNatsServer: target conf file '${confPath}' already exists so updating it`,
    );
  }

  // const { config, operatorExists } = await configureNsc();

  await writeFile(
    confPath,
    `
listen: ${natsServer}:${natsPorts.server}

max_payload:${max_payload}

jetstream: enabled

jetstream {
  store_dir: data/nats/jetstream
}

websocket {
  listen: "${natsServer}:${natsPorts.ws}"
  no_tls: true
  token_cookie: "${REMEMBER_ME_COOKIE_NAME}"
}

accounts {
  AUTH {
    users: [
       { user:"${natsUser}", password:"${natsPassword}" }
    ],
    jetstream: {
      max_mem: -1
      max_file: -1
      max_streams: -1
      max_consumers: -1
    }
  }
  SYS {}
}
system_account: SYS

max_control_line 64KB

authorization {
  # slightly longer timeout (than 2s default): probably not necessary, but db
  # queries involved (usually takes 50ms - 250ms)
  timeout: 3
  auth_callout {
    issuer: ${ISSUER_NKEY}
    xkey: ${ISSUER_XKEY}
    users: [ ${natsUser} ]
    account: AUTH
  }
}

`,
  );

  // Ensure that ONLY we can read/write the nats config directory,
  // which contains highly sensitive information.  This could matter
  // on cocalc-docker style systems.
  await executeCode({ command: "chmod", args: ["og-rwx", "-R", nats] });
}

export async function configureNsc() {
  let operatorExists;
  try {
    await nsc(["describe", "operator", natsAccountName]);
    operatorExists = true;
  } catch {
    operatorExists = false;
  }
  if (!operatorExists) {
    // initialize the local nsc account config
    await nsc(["init", "--name", natsAccountName]);
    // set the url for the operat
    await nsc(["edit", "operator", "--account-jwt-server-url", natsServerUrl]);
    // make cocalc user able to pub and sub to everything
    await nsc(["edit", "user", "--name", "cocalc", "--allow-pubsub", ">"]);
    // enable jetstream for the cocalc account
    await nsc([
      "edit",
      "account",
      "--js-mem-storage=-1",
      "--js-disk-storage=-1",
    ]);
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
  }
  // return the operator and system_account for inclusion in server config
  const { stdout } = await nsc(["generate", "config", "--nats-resolver"]);
  const i = stdout.indexOf("system_account");
  const j = stdout.indexOf("\n", i + 1);
  return { config: stdout.slice(0, j), operatorExists };
}

export async function main() {
  await configureNatsServer();
  process.exit(0);
}
