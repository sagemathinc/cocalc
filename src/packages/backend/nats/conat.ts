import { conatPath, conatServer } from "@cocalc/backend/data";
import {
  connect as connect0,
  Client,
  type ConnectOptions,
} from "@cocalc/nats/core/client";

export type { Client };

export function connect(address?, options?: ConnectOptions): Client {
  return connect0(address ? address : conatServer, {
    path: conatPath,
    ...options,
  });
}
