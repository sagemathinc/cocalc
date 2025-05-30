import { conatPassword, conatServer } from "@cocalc/backend/data";
import { connect, Client, type ClientOptions } from "@cocalc/conat/core/client";
import { HUB_PASSWORD_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { inboxPrefix } from "@cocalc/conat/names";

export type { Client };

export function conat(options?: ClientOptions): Client {
  return connect({
    address: conatServer,
    inboxPrefix: inboxPrefix({ hub_id: "hub" }),
    extraHeaders: {
      Cookie: `${HUB_PASSWORD_COOKIE_NAME}=${conatPassword}`,
    },
    ...options,
  });
}
