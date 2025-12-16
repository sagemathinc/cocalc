import {
  changefeedServer,
  type ConatSocketServer,
} from "@cocalc/conat/hub/changefeeds";
import { type Client } from "@cocalc/conat/core/client";

import userQuery, { cancelQuery } from "./user-query";

let server: ConatSocketServer | null = null;

export function init({ client }: { client: Client }): void {
  server = changefeedServer({
    client,
    userQuery,
    cancelQuery,
  });
}

export function close(): void {
  server?.close();
  server = null;
}
