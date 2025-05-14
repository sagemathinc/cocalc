import { conatPath, conatServer } from "@cocalc/backend/data";
import { connect as connectToConat } from "@cocalc/nats/server/client";

export function connect() {
  return connectToConat(conatServer, { path: conatPath });
}
