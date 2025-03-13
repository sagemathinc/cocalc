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


WHY NOT DECENTRALIZED AUTH?

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
import {
  ISSUER_XSEED,
  ISSUER_NSEED,
} from "@cocalc/backend/nats/conf";
import { fromPublic, fromSeed } from "@nats-io/nkeys";
import {
  decode as decodeJwt,
  encodeAuthorizationResponse,
  encodeUser,
} from "@nats-io/jwt";

export async function init() {
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

async function listen(api, xkp) {
  console.log("listening...");
  try {
    for await (const mesg of api) {
      console.log("listen -- get ", mesg);
      const token = getToken(mesg, xkp);
      const requestClaim = decodeJwt(token) as any;
      global.x = {
        mesg,
        xkp,
        token,
        decodeJwt,
        fromSeed,
        encoder: new TextEncoder(),
        xseed: ISSUER_XSEED,
        requestClaim,
      };
      const userNkey = requestClaim.nats.user_nkey;
      const serverId = requestClaim.nats.server_id;

      const user = fromPublic(userNkey);
      const server = fromPublic(serverId.name);
      const encoder = new TextEncoder();
      const issuer = fromSeed(encoder.encode(ISSUER_NSEED));
      const userName = requestClaim.nats.connect_opts.user;
      const opts = { aud: "cocalc" };
      const jwt = await encodeUser(userName, user, issuer, {}, opts);
      global.x.jwt = jwt;
      const data = { jwt };
      const authResponse = await encodeAuthorizationResponse(
        user,
        server,
        issuer,
        data,
        opts,
      );
      global.x.authResponse = authResponse;
      const xkey = mesg.headers.get("Nats-Server-Xkey");
      let signedResponse;
      if (xkey) {
        signedResponse = xkp.seal(encoder.encode(authResponse), xkey);
      } else {
        signedResponse = encoder.encode(authResponse);
      }
      global.x.signedResponse = signedResponse;

      mesg.respond(signedResponse);
    }
  } catch (err) {
    console.warn("Problem with auth callout", err);
    // TODO: restart
  }
}

function getToken(mesg, xkp): string {
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
