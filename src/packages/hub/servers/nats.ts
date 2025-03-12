/*
NATS WebSocket proxy -- this primarily just directly proxied the nats
websocket server, so outside browsers can connect to it.

We assume there is a NATS server running on localhost.  This gets configured in
dev mode automatically and started via

$ cd ~/cocalc/src
$ pnpm nats-server

*/

import { createProxyServer } from "http-proxy";
import getLogger from "@cocalc/backend/logger";
import { type Router } from "express";
import getAccount from "@cocalc/server/auth/get-account";
import setNatsCookie from "@cocalc/server/auth/set-nats-cookie";
import { natsWebsocketServer } from "@cocalc/backend/data";
import { getApiKey } from "@cocalc/server/auth/api";
import { getAccountWithApiKey } from "@cocalc/server/api/manage";

const logger = getLogger("hub:nats");

export async function proxyNatsWebsocket(req, socket, head) {
  logger.debug("nats proxy -- handling a connection");
  const target = natsWebsocketServer;
  const proxy = createProxyServer({
    ws: true,
    target,
    timeout: 3000,
  });
  // TODO: we could do "const account_id = await getAccount(req);" and thus verify user is signed in
  // before even allowing an attempt to connect.  However, connecting without a valid JWT cookie
  // just results in immediately failure anyways, so there is no need.
  proxy.ws(req, socket, head);
}

export function initNatsServer(router: Router) {
  router.get("/nats", async (req, res) => {
    if (req.header("Authorization")) {
      // api-key access
      try {
        const api_key = await getApiKey(req);
        const user = await getAccountWithApiKey(api_key);
        if (user == null) {
          res.json({ error: "not signed in via api key" });
        }
        await setNatsCookie({ req, res, ...user });
        res.json(user);
      } catch (err) {
        res.json({ error: `${err}` });
      }
    }
    // cookie access?
    const account_id = await getAccount(req);
    if (account_id) {
      try {
        await setNatsCookie({ req, res, account_id });
        res.json({ account_id });
      } catch (err) {
        res.json({ error: `${err}` });
      }
    } else {
      res.json({ error: "not signed in" });
    }
  });
}
