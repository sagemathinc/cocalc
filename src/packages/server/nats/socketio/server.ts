/*
To start this standalone

pnpm conat-server


It will also get run integrated with the hub if the --conat-server option is passed in
*/

import { init as createConatServer } from "@cocalc/nats/server/server";
import { Server } from "socket.io";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("conat-server");

export function init({
  port,
  httpServer,
  path,
}: { port?: number; httpServer?; path?: string } = {}) {
  logger.debug("init", { port, httpServer: httpServer != null, path });

  createConatServer({
    port,
    httpServer,
    Server,
    logger: logger.debug,
    path,
    getUser,
  });
}

import { getAccountIdFromRememberMe } from "@cocalc/server/auth/get-account";
import { parse } from "cookie";
import { REMEMBER_ME_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { getRememberMeHashFromCookieValue } from "@cocalc/server/auth/remember-me";

// [ ] TODO -- api keys, hubs,
export async function getUser(socket) {
  if (!socket.handshake.headers.cookie) {
    return;
  }
  const cookies = parse(socket.handshake.headers.cookie);
  const value = cookies[REMEMBER_ME_COOKIE_NAME];
  if (!value) {
    return;
  }
  const hash = getRememberMeHashFromCookieValue(value);
  if (!hash) {
    return;
  }
  const account_id = await getAccountIdFromRememberMe(hash);
  return { account_id };
}
