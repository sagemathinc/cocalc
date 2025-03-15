/*
Implementation of Auth Callout for NATS


AUTH CALLOUT

This should work. It means a cocalc server (which relies on the database) *must*
be available to handle every user connection... but that's ok. It also makes
banning users a bit more complicated.

Relevant docs:

- https://docs.nats.io/running-a-nats-service/configuration/securing_nats/auth_callout

- https://github.com/nats-io/nats-architecture-and-design/blob/main/adr/ADR-26.md

- https://natsbyexample.com/examples/auth/callout/cli

- https://www.youtube.com/watch?v=VvGxrT-jv64



DEVELOPMENT


> await require('@cocalc/server/nats/auth').init()


WHY NOT DECENTRALIZED AUTH?

I wish I knew the following earlier, as it would have saved me at least a
week of work...

We *fully* implemented decentralized auth first using JWT's, but it DOES NOT
SCALE! The problem is that we need potentially dozens of pub/sub rules for each
user, so that's too much information to put in a client JWT cookie, so we
*must* use signing keys. Thus the permissions information for every user goes
into one massive account key blob, and a tiny signed JWT goes to each browser.
This is so very nice because permissions can be dynamically updated at any time,
and everybody's permissions are known to NATS without cocalc's database having
to be consulted at all... SADLY, it doesn't scale, since every time we make a
change the account key has to be updated, and only a few hundred (or thousand)
users are enough to make it too big. Decentralized auth could work if each
cocalc user had a different account, but... that doesn't work either, since
import/export doesn't really work for jetstream... and setting up all the
import/export would be a nightmare, and probaby much more complicated.

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

const logger = getLogger("server:nats:auth-callout");

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
  });
  const g = service.addGroup("$SYS").addGroup("REQ").addGroup("USER");
  const api = g.addEndpoint("AUTH");
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

// sessions automatically expire after 12 hours.
const SESSION_EXPIRE_MS = 1000 * 60 * 12;

async function listen(api, xkp) {
  console.log("listening...");
  try {
    for await (const mesg of api) {
      handleRequest(mesg, xkp);
    }
  } catch (err) {
    console.warn("Problem with auth callout", err);
    // TODO: restart
  }
}

async function handleRequest(mesg, xkp) {
  const t0 = Date.now();
  try {
    const requestJwt = getRequestJwt(mesg, xkp);
    const requestClaim = decodeJwt(requestJwt) as any;
    logger.debug("handleRequest", requestClaim.nats.connect_opts.user);
    const userNkey = requestClaim.nats.user_nkey;
    const serverId = requestClaim.nats.server_id;
    const { pub, sub } = await getPermissions(requestClaim.nats.connect_opts);
    const user = fromPublic(userNkey);
    const server = fromPublic(serverId.name);
    const encoder = new TextEncoder();
    const issuer = fromSeed(encoder.encode(ISSUER_NSEED));
    const userName = requestClaim.nats.connect_opts.user;
    const opts = { aud: "cocalc" };
    // start slightly in past in case clocks aren't identical.
    const start = new Date(Date.now() - 2 * 1000 * 60);
    const end = new Date(start.valueOf() + SESSION_EXPIRE_MS);
    const jwt = await encodeUser(
      userName,
      user,
      issuer,
      {
        pub,
        sub,
        times: [
          {
            start: formatTime(start),
            end: formatTime(end),
          },
        ],
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

function formatTime(d) {
  let hours = String(d.getHours()).padStart(2, "0");
  let minutes = String(d.getMinutes()).padStart(2, "0");
  let seconds = String(d.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
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
  user,
}: {
  // auth token:
  //   - remember me
  //   - api key
  //   - project secret
  auth_token?: string;
  user?: string;
}) {
  if (!user) {
    throw Error("user must be specified");
  }
  const {
    account_id,
    project_id,
    project_ids: requested_project_ids,
  } = JSON.parse(user) ?? {};
  const { project_ids } = await validate({
    account_id,
    project_id,
    auth_token,
    requested_project_ids,
  });
  return getUserPermissions({ account_id, project_id, project_ids });
}
