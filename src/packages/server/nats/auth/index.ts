/*
Implementation of Auth Callout for NATS

DEPLOYMENT:

Run as many of these as you want -- the load gets randomly spread across all of them.
They just need access to the database.

There is some nontrivial compute associated with handling each auth, due to:

 - 1000 rounds of sha512 for the remember_me cookie takes time
 - encoding/encrypting/decoding/decrypting JWT stuff with NATS takes maybe 50ms of CPU.

The main "weird" thing about this is that when a connection is being authenticated,
we have to decide on its *exact* permissions once-and-for all at that point in time.
This means browser clients have to reconnect if they want to communicate with a project
they didn't explicit authenticate to.

AUTH CALLOUT

At least one of these cocalc servers (which relies on the database) *must*
be available to handle every user connection, unlike with decentralized PKI auth.
It also makes banning users a bit more complicated.

DOCS:

- https://docs.nats.io/running-a-nats-service/configuration/securing_nats/auth_callout

- https://github.com/nats-io/nats-architecture-and-design/blob/main/adr/ADR-26.md

- https://natsbyexample.com/examples/auth/callout/cli

- https://www.youtube.com/watch?v=VvGxrT-jv64


DEVELOPMENT

1. From the browser, turn off the nats auth that is being served by your development hub
by sending this message from a browser as an admin:

   await cc.client.nats_client.hub.system.terminate({service:'auth'})

2. Run this code in nodejs:

   x = await require('@cocalc/server/nats/auth').init()


NOTE: there's no way to turn the auth back on in the hub, so you'll have to restart
your dev hub after doing the above.


WHY NOT DECENTRALIZED AUTH?

I wish I knew the following earlier, as it would have saved me at least a
week of work...

We *fully* implemented decentralized auth first using JWT's, but it DOES NOT
SCALE! The problem is that we need potentially dozens of pub/sub rules for each
user, so that's too much information to put in a client JWT cookie, so we
*must* use signing keys. Thus the permissions information for every user goes
into one massive account key blob, and a tiny signed JWT goes to each browser.
This is very nice because permissions can be dynamically updated at any time,
and everybody's permissions are known to NATS without cocalc's database having
to be consulted at all (that said, with multiple nats servers, I am worries the
permissions update would take too long).   SADLY, this doesn't scale!
Every time we make a change, the account key has to be updated, and only
a few hundred (or thousand)
users are enough to make the key too big to fit in a message.
Also, each  update would take at least a second.  Now imagine 150 students in
a class all signing in at once, and it taking over 150 seconds just to
process auth, and you can see this is a nonstarter.
Decentralized auth could work if each cocalc user had a different
account, but... that doesn't work either, since import/export doesn't
really work for jetstream... and setting up all the
import/export would be a nightmare, and probaby much more complicated.

NOTE: There is one approach to decentralized auth that doesn't obviously fail,
but it would require a separate websocket connection for each project and maybe
some mangling of auth cookies in the proxy server.  That said, it still relies
on using command line nsc with pull/push, which feels very slow and brittle.
Using a separate connection for each project is also just really bad practice.
*/

import { Svcm } from "@nats-io/services";
import { getConnection } from "@cocalc/backend/nats";
import type { NatsConnection } from "@nats-io/nats-core";
import { ISSUER_XSEED, ISSUER_NSEED } from "@cocalc/backend/nats/conf";
import { fromPublic, fromSeed } from "@nats-io/nkeys";
import {
  decode as decodeJwt,
  encodeAuthorizationResponse,
  encodeUser,
} from "@nats-io/jwt";
import getLogger from "@cocalc/backend/logger";
import { getUserPermissions } from "./permissions";
import { validate } from "./validate";
import adminAlert from "@cocalc/server/messages/admin-alert";

const logger = getLogger("server:nats:auth-callout");

let api: any | null = null;
export async function init() {
  logger.debug("init");
  // coerce to NatsConnection is to workaround a bug in the
  // typescript libraries for nats, which might disappear at some point.
  const nc = (await getConnection()) as NatsConnection;
  const svcm = new Svcm(nc);

  const service = await svcm.add({
    name: "auth",
    version: "0.0.1",
    description: "CoCalc auth callout service",
    // all auth callout handlers randomly take turns authenticating users
    queue: "q",
  });
  const g = service.addGroup("$SYS").addGroup("REQ").addGroup("USER");
  api = g.addEndpoint("AUTH");
  const encoder = new TextEncoder();

  const xkp = fromSeed(encoder.encode(ISSUER_XSEED));
  listen(api, xkp);

  return {
    service,
    nc,
    close: () => {
      api.stop();
    },
  };
}

export function terminate() {
  api?.stop();
}

//const SESSION_EXPIRE_MS = 1000 * 60 * 60 * 12;

async function listen(api, xkp) {
  logger.debug("listening...");
  try {
    for await (const mesg of api) {
      // do NOT await this
      handleRequest(mesg, xkp);
    }
  } catch (err) {
    logger.debug("WARNING: Problem with auth callout", err);
    // restart? I don't know why this would ever fail assuming
    // our code isn't buggy, hence alert if this ever happens:
    adminAlert({
      subject: "NATS auth-callout service crashed",
      body: `A nats auth callout service crashed with the following error:\n\n${err}\n\nWilliam thinks this is impossible and will never happen, so investigate.  This problem could cause all connections to cocalc to fail, and would be fixable by restarting the hubs.`,
    });
  }
}

async function handleRequest(mesg, xkp) {
  const t0 = Date.now();
  try {
    const requestJwt = getRequestJwt(mesg, xkp);
    const requestClaim = decodeJwt(requestJwt) as any;
    logger.debug("handleRequest", requestClaim.nats.connect_opts.name);
    const userNkey = requestClaim.nats.user_nkey;
    const serverId = requestClaim.nats.server_id;
    const { pub, sub } = await getPermissions(requestClaim.nats.connect_opts);
    const user = fromPublic(userNkey);
    const server = fromPublic(serverId.name);
    const encoder = new TextEncoder();
    const issuer = fromSeed(encoder.encode(ISSUER_NSEED));
    const userName = requestClaim.nats.connect_opts.user;
    const opts = { aud: "cocalc" };
    const jwt = await encodeUser(
      userName,
      user,
      issuer,
      {
        pub,
        sub,
        locale: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      opts,
    );
    const data = { jwt };
    const authResponse = await encodeAuthorizationResponse(
      user,
      server,
      issuer,
      data,
      opts,
    );
    const xkey = mesg.headers.get("Nats-Server-Xkey");
    let signedResponse;
    if (xkey) {
      signedResponse = xkp.seal(encoder.encode(authResponse), xkey);
    } else {
      signedResponse = encoder.encode(authResponse);
    }

    mesg.respond(signedResponse);
  } catch (err) {
    // TODO: send fail response (?)
    logger.debug(`Warning - ${err}`);
  } finally {
    logger.debug(
      `time to handle one auth request completely: ${Date.now() - t0}ms`,
    );
  }
}

function getRequestJwt(mesg, xkp): string {
  const xkey = mesg.headers.get("Nats-Server-Xkey");
  let data;
  if (xkey) {
    // encrypted
    // we have ISSUER_XSEED above.  So have enough info to decrypt.
    data = xkp.open(mesg.data, xkey);
  } else {
    // not encrypted
    data = mesg.data;
  }
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(data);
}

async function getPermissions({
  auth_token,
  name,
}: {
  // auth token:
  //   - remember me
  //   - api key
  //   - project secret
  auth_token?: string;
  name?: string;
}) {
  if (!name) {
    throw Error("name must be specified");
  }
  const {
    account_id,
    project_id,
    project_ids: requested_project_ids,
  } = JSON.parse(name) ?? {};
  const { project_ids } = await validate({
    account_id,
    project_id,
    auth_token,
    requested_project_ids,
  });
  return getUserPermissions({ account_id, project_id, project_ids });
}
