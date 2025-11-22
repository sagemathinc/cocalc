/*
Create a connection to a conat server authenticated as a project or compute
server, via an api key or the project secret token.
*/

import * as backendData from "@cocalc/backend/data";
import {
  connect,
  type Client as ConatClient,
  type ClientOptions,
} from "@cocalc/conat/core/client";
import {
  API_COOKIE_NAME,
  PROJECT_SECRET_COOKIE_NAME,
  PROJECT_ID_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";
import { inboxPrefix } from "@cocalc/conat/names";
import { setConatClient } from "@cocalc/conat/client";
import * as projectData from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";
import { versionCheckLoop } from "./hub";

const data = { ...backendData, ...projectData };

const logger = getLogger("conat:connection");

export function getIdentity({
  client = connectToConat(),
  compute_server_id = data.compute_server_id,
  project_id,
}: {
  client?: ConatClient;
  compute_server_id?: number;
  project_id?: string;
} = {}): {
  client: ConatClient;
  compute_server_id: number;
  project_id: string;
} {
  project_id ??= client.info?.user?.project_id ?? data.project_id;
  return { client, compute_server_id, project_id: project_id! };
}

export function connectToConat(
  options?: ClientOptions & {
    apiKey?: string;
    secretToken?: string;
    project_id?: string;
  },
): ConatClient {
  logger.debug("connectToConat");
  const apiKey = options?.apiKey ?? data.apiKey;
  const project_id = options?.project_id ?? data.project_id;
  const secretToken = options?.secretToken ?? data.secretToken;
  const address = options?.address ?? data.conatServer;

  let Cookie;
  if (apiKey) {
    Cookie = `${API_COOKIE_NAME}=${apiKey}`;
  } else if (secretToken) {
    Cookie = `${PROJECT_SECRET_COOKIE_NAME}=${secretToken}; ${PROJECT_ID_COOKIE_NAME}=${project_id}`;
  } else {
    Cookie = "";
  }
  const conn = connect({
    address,
    inboxPrefix: inboxPrefix({ project_id }),
    extraHeaders: { Cookie },
    ...options,
  });
  if (apiKey) {
    // we don't know the project_id that this apiKey provides access to. That
    // project_id is in info.user, which we only know after being authenticated
    // with the api key!
    conn.inboxPrefixHook = (info) => {
      return info?.user ? inboxPrefix(info?.user) : undefined;
    };
  }

  versionCheckLoop(conn);
  return conn;
}

export function init() {
  setConatClient({
    conat: connectToConat,
    project_id: data.project_id,
    compute_server_id: data.compute_server_id,
    getLogger,
  });
}
init();
