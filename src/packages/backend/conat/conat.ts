import { conatPassword, conatServer } from "@cocalc/backend/data";
import {
  connect as connect0,
  Client,
  type ClientOptions,
} from "@cocalc/conat/core/client";

export type { Client };

export function connect(options?: ClientOptions): Client {
  return connect0({
    address: conatServer,
    extraHeaders: {
      Cookie: `Hub-Password=${conatPassword}`,
    },
    ...options,
  });
}
