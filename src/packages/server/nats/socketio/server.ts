import { Server } from "socket.io";

import { init } from "@cocalc/nats/server/server";

export function init() {
  return init({ Server });
}
