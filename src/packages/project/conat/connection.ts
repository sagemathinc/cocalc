/*
Create a connection to a conat server authenticated as a project or compute
server, via an api key or the project secret token.
*/

import { apiKey, conatServer } from "@cocalc/backend/data";
import { secretToken } from "@cocalc/project/data";
import { connect, type Client } from "@cocalc/conat/core/client";
import {
  API_COOKIE_NAME,
  PROJECT_SECRET_COOKIE_NAME,
  PROJECT_ID_COOKIE_NAME,
} from "@cocalc/backend/auth/cookie-names";
import { inboxPrefix } from "@cocalc/conat/names";
import { setConatClient } from "@cocalc/conat/client";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { version as ourVersion } from "@cocalc/util/smc-version";
import { getLogger } from "@cocalc/project/logger";
import { initHubApi } from "@cocalc/conat/hub/api";
import { delay } from "awaiting";

const logger = getLogger("conat:connection");

const VERSION_CHECK_INTERVAL = 2 * 60000;

let cache: Client | null = null;
export function connectToConat(options?): Client {
  if (cache != null) {
    return cache;
  }
  let Cookie;
  if (apiKey) {
    Cookie = `${API_COOKIE_NAME}=${apiKey}`;
  } else {
    Cookie = `${PROJECT_SECRET_COOKIE_NAME}=${secretToken}; ${PROJECT_ID_COOKIE_NAME}=${project_id}`;
  }
  cache = connect({
    address: conatServer,
    inboxPrefix: inboxPrefix({ project_id }),
    extraHeaders: { Cookie },
    ...options,
  });

  versionCheckLoop(cache);

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

async function callHub({
  client,
  service = "api",
  name,
  args = [],
  timeout,
}: {
  client: Client;
  service?: string;
  name: string;
  args: any[];
  timeout?: number;
}) {
  const subject = `hub.project.${project_id}.${service}`;
  try {
    const data = { name, args };
    const resp = await client.request(subject, data, { timeout });
    return resp.data;
  } catch (err) {
    err.message = `${err.message} - callHub: subject='${subject}', name='${name}', `;
    throw err;
  }
}

async function versionCheckLoop(client) {
  const hub = initHubApi((opts) => callHub({ ...opts, client }));
  while (true) {
    try {
      const { version } = await hub.system.getCustomize(["version"]);
      logger.debug("versionCheckLoop: ", { ...version, ourVersion });
      if (version != null) {
        const requiredVersion = compute_server_id
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
