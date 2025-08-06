/*
Service to load balance running cocalc projects across the runners.

Tests are in

 - packages/backend/conat/test/project

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import {
  client as projectRunnerClient,
  type ProjectStatus,
  getRunners,
  type RunnerStatus,
} from "./run";
import { until } from "@cocalc/util/async-utils";
import { getLogger } from "@cocalc/conat/client";
import { isEqual } from "lodash";

const logger = getLogger("conat:project:runner:load-balancer");

export interface Options {
  subject?: string;
  client?: Client;
  maxWait?: number;
}

export interface API {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  status: () => Promise<ProjectStatus>;
}

export async function server({
  subject = "project.*.run",
  client,
  maxWait = 10_000,
}: Options) {
  client ??= conat();

  // - [ ] get info about the runner's status (use a stream?) -- write that here.
  // - [ ] connect to database to get quota for running a project -- via a function that is passed in
  // - [ ] it will contact runner to run project -- write that here.

  let runners: RunnerStatus[] = [];
  let stopUpdating = false;
  (async () => {
    await until(
      async () => {
        if (stopUpdating) {
          return true;
        }
        try {
          const lastRunners = runners;
          runners = await getRunners({ maxWait });
          if (!isEqual(runners, lastRunners)) {
            logger.debug("runners changed", runners);
          }
        } catch (err) {
          logger.debug(`WARNING: problem getting runners`, err);
        }
        return false;
      },
      { min: 1000, max: 1000 },
    );
  })();

  const getClient = async (_project_id: string) => {
    if (runners.length == 0) {
      throw Error("no project runners available -- try again later");
    }
    return projectRunnerClient({
      client,
      subject: `project-runner.${runners[0].id}`,
    });
  };

  const sub = await client.service<API>(subject, {
    async start() {
      const subject = (this as any).subject as string;
      const project_id = subject.split(".")[1];
      const runClient = await getClient(project_id);
      await runClient.start({ project_id });
    },
    async stop() {
      const subject = (this as any).subject as string;
      const project_id = subject.split(".")[1];
      const runClient = await getClient(project_id);
      await runClient.stop({ project_id });
    },
    async status() {
      const subject = (this as any).subject as string;
      const project_id = subject.split(".")[1];
      const runClient = await getClient(project_id);
      return await runClient.status({ project_id });
    },
  });

  return {
    close: () => {
      stopUpdating = true;
      sub.close();
    },
  };
}

export function client({
  client,
  subject,
}: {
  client?: Client;
  subject: string;
}): API {
  client ??= conat();
  return client.call<API>(subject);
}
