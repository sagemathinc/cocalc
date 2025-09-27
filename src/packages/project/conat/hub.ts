/*
Calling the hub's conat api from a project.

The hub api is primarily for users, so most functions will give an error.
However, there are a few endpoints aimed at projects.
*/

import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { initHubApi } from "@cocalc/conat/hub/api";
import { delay } from "awaiting";
import { getLogger } from "@cocalc/project/logger";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { version as ourVersion } from "@cocalc/util/smc-version";
import { project_id } from "@cocalc/project/data";

const VERSION_CHECK_INTERVAL = 5 * 60_000;

const logger = getLogger("project:conat:hub");

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
  const subject = `hub.project.${project_id}.${service}`;
  const resp = await client.request(subject, { name, args }, { timeout });
  return resp.data;
}

export function hubApi(client: ConatClient) {
  return initHubApi((opts) => callHub({ ...opts, client }));
}

export const versionCheckLoop = reuseInFlight(
  async (client: ConatClient) => {
    const hub = hubApi(client);
    await delay(5_000);
    while (true) {
      try {
        const { version } = await hub.system.getCustomize(["version"]);
        logger.debug("versionCheckLoop: ", { ...version, ourVersion });
        if (version != null) {
          const requiredVersion = version.min_project ?? 0;
          if ((ourVersion ?? 0) < requiredVersion) {
            logger.debug(
              `ERROR: our CoCalc version ${ourVersion} is older than the required version ${requiredVersion}.  \n\n** TERMINATING DUE TO VERSION BEING TOO OLD!!**\n\n`,
            );
            setTimeout(() => process.exit(1), 10);
          }
        }
      } catch (err) {
        logger.debug(
          `WARNING: problem getting version info from hub -- ${err}`,
        );
      }
      await delay(VERSION_CHECK_INTERVAL);
    }
  },
  { createKey: (args) => args[0].id },
);
