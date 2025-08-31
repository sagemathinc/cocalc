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
import { version as ourVersion } from "@cocalc/util/smc-version";
import { getLogger } from "@cocalc/project/logger";
import { initHubApi } from "@cocalc/conat/hub/api";
import { delay } from "awaiting";

const data = { ...backendData, ...projectData };

const logger = getLogger("conat:connection");

const VERSION_CHECK_INTERVAL = 5 * 60_000;

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

async function callHub({
  client,
  service = "api",
  name,
  args = [],
  timeout,
}: {
  client: ConatClient;
  service?: string;
  name: string;
  args: any[];
  timeout?: number;
}) {
  const project_id = client.info?.user?.project_id;
  if (!project_id) {
    throw Error("project_id not known");
  }
  const subject = `hub.project.${project_id}.${service}`;
  const resp = await client.request(subject, { name, args }, { timeout });
  return resp.data;
}

async function versionCheckLoop(client) {
  const hub = initHubApi((opts) => callHub({ ...opts, client }));
  while (true) {
    try {
      const { version } = await hub.system.getCustomize(["version"]);
      logger.debug("versionCheckLoop: ", { ...version, ourVersion });
      if (version != null) {
        const requiredVersion = data.compute_server_id
          ? (version.min_compute_server ?? 0)
          : (version.min_project ?? 0);
        if ((ourVersion ?? 0) < requiredVersion) {
          logger.debug(
            `ERROR: our CoCalc version ${ourVersion} is older than the required version ${requiredVersion}.  \n\n** TERMINATING DUE TO VERSION BEING TOO OLD!!**\n\n`,
          );
          setTimeout(() => process.exit(1), 10);
        }
      }
    } catch (err) {
      logger.debug(`WARNING: problem getting version info from hub -- ${err}`);
    }
    await delay(VERSION_CHECK_INTERVAL);
  }
}
