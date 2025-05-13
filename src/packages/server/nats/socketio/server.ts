import { Server } from "socket.io";

import { init as init0 } from "@cocalc/nats/server/server";

export function init(opts?) {
  return init0({ Server, ...opts });
}
