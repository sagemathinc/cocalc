import { conatPath, conatServer } from "@cocalc/backend/data";
import { connect as getConnection, Client } from "@cocalc/nats/server/client";

export function connect(options?): Client {
  return getConnection(options?.address ?? conatServer, {
    path: conatPath,
    ...options,
  });
}
