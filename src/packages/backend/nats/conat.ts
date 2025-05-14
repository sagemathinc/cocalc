import { conatPath, conatServer } from "@cocalc/backend/data";
import {
  connect as connectToConat,
  Client as ConatClient,
} from "@cocalc/nats/server/client";

let _connection: any = null;
export function connect(): ConatClient {
  if (_connection == null) {
    _connection = connectToConat(conatServer, { path: conatPath });
  }
  return _connection as ConatClient;
}
