import { conatPassword, conatServer } from "@cocalc/backend/data";
import { HUB_PASSWORD_COOKIE_NAME } from "@cocalc/backend/auth/cookie-names";
import { inboxPrefix } from "@cocalc/conat/names";
import { connect, type ClientOptions, type Client } from "@cocalc/conat/core/client";
import {
  routeProjectSubject,
  listenForUpdates as listenForProjectHostUpdates,
} from "./route-project";

// Create or reuse a conat client and retrofit project routing onto it.
// We intentionally set the route function after creation so we can mutate
// an existing cached client that may have been created before routing
// was configured (e.g., backend/conat init).
let listenerStarted = false;

export function conatWithProjectRouting(options?: ClientOptions): Client {
  if (!listenerStarted) {
    listenerStarted = true;
    // Ensure we hear about project host changes so routing stays fresh.
    listenForProjectHostUpdates().catch(() => {
      listenerStarted = false;
    });
  }
  const { routeSubject, ...rest } = options ?? {};
  const client = connect({
    address: conatServer,
    inboxPrefix: inboxPrefix({ hub_id: "hub" }),
    extraHeaders: {
      Cookie: `${HUB_PASSWORD_COOKIE_NAME}=${conatPassword}`,
    },
    ...rest,
  });
  const combinedRoute =
    routeSubject == null
      ? routeProjectSubject
      : (subject: string) => routeSubject(subject) ?? routeProjectSubject(subject);
  client.setRouteSubject(combinedRoute);
  return client;
}
