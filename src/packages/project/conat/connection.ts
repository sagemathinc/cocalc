/*
Create a connection to a conat server authenticated as a project or compute
server, via an api key or the project secret token.
*/

import { apiKey, conatServer } from "@cocalc/backend/data";
import secretToken from "@cocalc/project/servers/secret-token";
import { connect, type Client } from "@cocalc/conat/core/client";
import {
  API_COOKIE_NAME,
  PROJECT_SECRET_COOKIE_NAME,
  PROJECT_ID_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";
import { inboxPrefix } from "@cocalc/conat/names";
import { setConatClient } from "@cocalc/conat/client";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

let cache: Client | null = null;
export async function connectToConat(options?): Promise<Client> {
  if (cache != null) {
    return cache;
  }
  let Cookie;
  if (apiKey) {
    Cookie = `${API_COOKIE_NAME}=${apiKey}`;
  } else {
    Cookie = `${PROJECT_SECRET_COOKIE_NAME}=${await secretToken()}; ${PROJECT_ID_COOKIE_NAME}=${project_id}`;
  }
  cache = connect({
    address: conatServer,
    inboxPrefix: inboxPrefix({ project_id }),
    extraHeaders: { Cookie },
    ...options,
  });
  return cache!;
}

export function init() {
  setConatClient({
    conat: connectToConat,
    project_id,
    compute_server_id,
    getLogger,
  });
}
init();
