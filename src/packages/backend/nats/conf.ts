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
  nats,
  natsPorts,
  natsServer,
  natsPassword,
  natsPasswordPath,
  setNatsPassword,
  natsUser,
  natsAuthCalloutNSeed,
  setNatsAuthCalloutNSeed,
  natsAuthCalloutNSeedPath,
  natsAuthCalloutXSeed,
  setNatsAuthCalloutXSeed,
  natsAuthCalloutXSeedPath,
  natsClusterName,
  natsServerName,
} from "@cocalc/backend/data";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";
import { writeFile } from "fs/promises";
import { REMEMBER_ME_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { executeCode } from "@cocalc/backend/execute-code";
import { createPrivateKey, publicKey } from "./nkeys";

const logger = getLogger("backend:nats:install");

// this is assumed in cocalc/src/package.json:
const confPath = join(nats, "server.conf");

// for now for local dev:
export const natsServerUrl = `nats://${natsServer}:${natsPorts.server}`;
export const natsAccountName = "cocalc";

// I tested and if you make this bigger, then smaller, it does NOT break
// large jetstream messages created when it was bigger.  So it should be
// safe to adjust.
// 1MB is the global NATS default
// const max_payload = "1MB";
// Note that 64MB is the max allowed.
const max_payload = process.env.COCALC_NATS_MAX_PAYLOAD ?? "8MB";
// However, using anything big means messages can take longer to send
// messages and risk timing out.  I've also implemented chunking,
// *everywhere* it is needed.
// Clients do NOT cache the payload size so if you make it big, then make it
// small, that does not require restarting everything.

export async function configureNatsServer() {
  logger.debug("configureNatsServer", { confPath, natsPorts });
  if (await pathExists(confPath)) {
    logger.debug(
      `configureNatsServer: target conf file '${confPath}' already exists so updating it`,
    );
  }

  let ISSUER_NKEY, ISSUER_XKEY, PASSWORD;
  if (!natsPassword) {
    PASSWORD = createPrivateKey("user");
    setNatsPassword(PASSWORD);
    await writeFile(natsPasswordPath, PASSWORD);
  } else {
    PASSWORD = natsPassword;
  }
  if (!natsAuthCalloutNSeed) {
    const nseed = createPrivateKey("account");
    setNatsAuthCalloutNSeed(nseed);
    await writeFile(natsAuthCalloutNSeedPath, nseed);
    ISSUER_NKEY = publicKey(nseed);
  } else {
    ISSUER_NKEY = publicKey(natsAuthCalloutNSeed);
  }
  if (!natsAuthCalloutXSeed) {
    const xseed = createPrivateKey("curve");
    setNatsAuthCalloutXSeed(xseed);
    await writeFile(natsAuthCalloutXSeedPath, xseed);
    ISSUER_XKEY = publicKey(xseed);
  } else {
    ISSUER_XKEY = publicKey(natsAuthCalloutXSeed);
  }

  // problem with server_name -- this line
  //   const user = fromPublic(userNkey);
  // in server/nats/auth/index.ts fails.

  await writeFile(
    confPath,
    `
# Amazingly, just setting the server_name breaks auth callout,
# with it saying the nkey is invalid.  This may require a lot
# "reverse engineering" work.
# server_name: ${natsServerName}
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

# This does not work yet.  I guess a single node cluster
# isn't possible.  Reload also isn't -- the only way we ever
# grow to multiple nodes will require restarts.
# cluster {
#   name: "${natsClusterName}"
#   listen: "${natsServer}:${natsPorts.cluster}"
#   routes: ["${natsServer}:${natsPorts.cluster}"]
#   compression: {
#     mode: s2_auto
#   }
# }

accounts {
  COCALC {
    users: [
       { user:"${natsUser}", password:"${PASSWORD}" }
    ],
    jetstream: {
      max_mem: -1
      max_file: -1
      max_streams: -1
      max_consumers: -1
    }
  }
  SYS {
   users: [
       { user:"sys", password:"${PASSWORD}" }
    ],
  }
}
system_account: SYS

max_control_line 64KB

authorization {
  # slightly longer timeout (than 2s default): probably not necessary, but db
  # queries involved (usually takes 50ms - 250ms)
  timeout: 7.5
  auth_callout {
    issuer: ${ISSUER_NKEY}
    xkey: ${ISSUER_XKEY}
    users: [ ${natsUser}, sys ]
    account: COCALC
  }
}

`,
  );

  // Ensure that ONLY we can read/write the nats config directory,
  // which contains highly sensitive information.  This could matter
  // on cocalc-docker style systems.
  await executeCode({ command: "chmod", args: ["og-rwx", nats] });
}

export async function main() {
  await configureNatsServer();
  process.exit(0);
}
