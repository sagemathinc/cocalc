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
import { ISSUER_XSEED, ISSUER_NSEED } from "@cocalc/backend/nats/conf";
import { fromPublic, fromSeed } from "@nats-io/nkeys";
import {
  decode as decodeJwt,
  encodeAuthorizationResponse,
  encodeUser,
} from "@nats-io/jwt";
import { isValidUUID } from "@cocalc/util/misc";
import { inboxPrefix } from "@cocalc/nats/names";
import getLogger from "@cocalc/backend/logger";

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
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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
  console.log("getPermissions", { auth_token, user });
  // user = account-{account_id} or project-{project_id}
  if (user?.startsWith("project-")) {
    const project_id = user.slice("project-".length);
    if (!isValidUUID(project_id)) {
      throw Error("invalid project_id");
    }
    return projectPermissions(project_id);
  } else if (user?.startsWith("account-")) {
    const account_id = user.slice("account-".length);
    if (!isValidUUID(account_id)) {
      throw Error("invalid account_id");
    }
    return accountPermissions(account_id);
  } else {
    throw Error(
      "invalid user format: must be 'account-{account_id}' or 'project-{project_id}'",
    );
  }
}

function commonPermissions(cocalcUser) {
  const pub = { allow: [] as string[], deny: [] as string[] };
  const sub = { allow: [] as string[], deny: [] as string[] };
  const userId = getCoCalcUserId(cocalcUser);
  if (!isValidUUID(userId)) {
    throw Error("must be a valid uuid");
  }
  const userType = getCoCalcUserType(cocalcUser);

  // can talk as *only this user* to the hub's api's
  pub.allow.push(`hub.${userType}.${userId}.>`);
  // everyone can publish to all inboxes.  This seems like a major
  //  security risk, but with request/reply, the reply subject under
  // _INBOX is a long random code that is only known for a moment
  // by the sender and the service, so I think it is NOT a security risk.
  pub.allow.push("_INBOX.>");

  // custom inbox only for this user -- critical for security, so we
  // can only listen to messages for us, and not for anybody else.
  sub.allow.push(inboxPrefix(cocalcUser) + ".>");
  // access to READ the public system info kv store.
  sub.allow.push("public.>");

  // get info about jetstreams
  pub.allow.push("$JS.API.INFO");
  // the public jetstream: this makes it available *read only* to all accounts and projects.
  pub.allow.push("$JS.API.*.*.public");
  pub.allow.push("$JS.API.*.*.public.>");
  pub.allow.push("$JS.API.CONSUMER.MSG.NEXT.public.>");

  // microservices info api -- **TODO: security concerns!?**
  // Please don't tell me I have to name all microservice identically :-(
  sub.allow.push("$SRV.>");
  pub.allow.push("$SRV.>");

  // so client can find out what they can pub/sub to...
  pub.allow.push("$SYS.REQ.USER.INFO");
  return { pub, sub };
}

function projectPermissions(project_id: string) {
  const { pub, sub } = commonPermissions({ project_id });

  pub.allow.push(`project.${project_id}.>`);
  sub.allow.push(`project.${project_id}.>`);

  pub.allow.push(`*.project-${project_id}.>`);
  sub.allow.push(`*.project-${project_id}.>`);

  // The unique project-wide jetstream key:value store
  pub.allow.push(`$JS.*.*.*.KV_project-${project_id}`);
  pub.allow.push(`$JS.*.*.*.KV_project-${project_id}.>`);
  // this FC is needed for "flow control" - without this, you get random hangs forever at scale!
  pub.allow.push(`$JS.FC.KV_project-${project_id}.>`);

  // The unique project-wide jetstream stream:
  pub.allow.push(`$JS.*.*.*.project-${project_id}`);
  pub.allow.push(`$JS.*.*.*.project-${project_id}.>`);
  pub.allow.push(`$JS.*.*.*.*.project-${project_id}.>`);
  return { pub, sub };
}

function accountPermissions(account_id: string) {
  const { pub, sub } = commonPermissions({ account_id });
  sub.allow.push(`*.account-${account_id}.>`);
  pub.allow.push(`*.account-${account_id}.>`);

  // the account-specific kv stores
  pub.allow.push(`$JS.*.*.*.KV_account-${account_id}`);
  pub.allow.push(`$JS.*.*.*.KV_account-${account_id}.>`);

  // the account-specific stream:
  pub.allow.push(`$JS.*.*.*.account-${account_id}`);
  pub.allow.push(`$JS.*.*.*.account-${account_id}.>`);
  pub.allow.push(`$JS.*.*.*.*.account-${account_id}`);
  pub.allow.push(`$JS.*.*.*.*.account-${account_id}.>`);
  sub.allow.push(`account.${account_id}.>`);
  pub.allow.push(`account.${account_id}.>`);

  // this FC is needed for "flow control" - without this, you get random hangs forever at scale!
  pub.allow.push(`$JS.FC.KV_account-${account_id}.>`);
  return { pub, sub };
}

// A CoCalc User is (so far): a project or account or a hub (not covered here).
export type CoCalcUser =
  | {
      account_id: string;
      project_id?: string;
    }
  | {
      account_id?: string;
      project_id: string;
    };

function getCoCalcUserType({
  account_id,
  project_id,
}: CoCalcUser): "account" | "project" {
  if (account_id) {
    if (project_id) {
      throw Error("exactly one of account_id or project_id must be specified");
    }
    return "account";
  }
  if (project_id) {
    return "project";
  }
  throw Error("account_id or project_id must be specified");
}

function getCoCalcUserId({ account_id, project_id }: CoCalcUser): string {
  if (account_id) {
    if (project_id) {
      throw Error("exactly one of account_id or project_id must be specified");
    }
    return account_id;
  }
  if (project_id) {
    return project_id;
  }
  throw Error("account_id or project_id must be specified");
}
