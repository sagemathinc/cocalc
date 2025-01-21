/*
Proof of concept NATS proxy.

We assume there is a NATS server running on localhost with this configuration:

# server.conf
websocket {
    listen: "localhost:8443"
    no_tls: true
    jwt_cookie: "cocalc_nats_jwt_cookie"
}

You could start this with

    nats-server -config server.conf

*/

import { createProxyServer } from "http-proxy";
import getLogger from "@cocalc/backend/logger";
import { NATS_JWT_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import Cookies from "cookies";
import { configureNatsUser, getJwt } from "@cocalc/server/nats/auth";
import { type Router } from "express";
import getAccount from "@cocalc/server/auth/get-account";

const logger = getLogger("hub:nats");

// todo: move to database/server settings/etc.?
const NATS_WS = "ws://localhost:8443";

export async function proxyNatsWebsocket(req, socket, head) {
  logger.debug("nats proxy -- handling a connection");
  const target = NATS_WS;
  const proxy = createProxyServer({
    ws: true,
    target,
    timeout: 5000,
  });
  proxy.ws(req, socket, head);
}

export function initNatsServer(router: Router) {
  router.get("/nats", async (req, res) => {
    const account_id = await getAccount(req);
    if (account_id) {
      await setNatsCookie(req, res, account_id);
    } else {
      res.json({ error: "not signed in" });
    }
  });
}

async function setNatsCookie(req, res, account_id: string) {
  try {
    const jwt = await getJwt({ account_id });
    // todo: how frequent?
    await configureNatsUser({ account_id });
    const cookies = new Cookies(req, res, { secure: true });
    // 6 months -- long is fine now since we support "sign out everywhere" ?
    const maxAge = 1000 * 24 * 3600 * 30 * 6;
    cookies.set(NATS_JWT_COOKIE_NAME, jwt, {
      maxAge,
      sameSite: true,
    });
  } catch (err) {
    res.json({ error: `Problem setting cookie -- ${err.message}.` });
    return;
  }
  res.json({ account_id });
}
