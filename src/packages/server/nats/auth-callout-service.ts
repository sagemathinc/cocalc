/*
Implementation of Auth Callout for NATS

The docs: https://docs.nats.io/running-a-nats-service/configuration/securing_nats/auth_callout


WHY NOT DECENTRALIZED AUTH?

We *fully* implemented decentralized auth first using JWT's, but it DOES NOT SCALE! The problem
is that we need potentially dozens of pub/sub rules for each user, so that's too much information
to put in a client JWT cookie, so we *must* use signing keys.  Thus the permissions information
for every user goes into one massive account key blob, and a tiny signed JWT goes to each browser.
This is so very nice because permissions can be dynamically updated at any time, and everybody's
permissions are known to NATS without cocalc's database having to be consulted at all... SADLY,
it doesn't scale, since every time we make a change the account key has to be updated, and only
a few hundred (or thousand) users are enough to make it too big.   Decentralized auth could work
if each cocalc user had a different account, but... that doesn't work either, since import/export
doesn't really work for jetstream... and setting up all the import/export would be a nightmare,
and probaby much more complicated.

AUTH CALLOUT

This should work.  It means a cocalc server (which relies on the database) *must* be available to
handle every user connection... but that's ok.  It also makes banning users a bit more complicated.
*/

import { Svcm } from "@nats-io/services";
import { getConnection } from "@cocalc/backend/nats";
import type { NatsConnection } from "@nats-io/nats-core";

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
  listen(api);

  return {
    service,
    nc,
    close: () => {
      api.stop();
    },
  };
}

async function listen(api) {
  console.log("listening...");
  try {
    for await (const mesg of api) {
      console.log("listen -- get ", mesg);
      global.x = { mesg };
      mesg.respond();
    }
  } catch (err) {
    console.warn("Problem with auth callout", err);
    // TODO: restart
  }
}
