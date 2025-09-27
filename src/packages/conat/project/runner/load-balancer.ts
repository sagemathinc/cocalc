/*
Service to load balance running cocalc projects across the runners.

Tests are in

 - packages/backend/conat/test/project

*/

import { type Client } from "@cocalc/conat/core/client";
import { randomChoice } from "@cocalc/conat/core/server";
import { conat } from "@cocalc/conat/client";
import { client as projectRunnerClient, UPDATE_INTERVAL } from "./run";
import state, { type ProjectStatus, type ProjectState } from "./state";
import { field_cmp } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:project:runner:load-balancer");

const MAX_STATUS_TRIES = 3;

export interface Options {
  subject?: string;
  client?: Client;
  setState?: (opts: {
    project_id: string;
    state: ProjectState;
  }) => Promise<void>;
  getConfig?: ({ project_id }: { project_id: string }) => Promise<any>;
}

export interface API {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  status: () => Promise<ProjectStatus>;
}

export async function server({
  subject = "project.*.run",
  client,
  setState,
  getConfig,
}: Options) {
  client ??= conat();

  // - [ ] get info about the runner's status (use a stream?) -- write that here.
  // - [ ] connect to database to get quota for running a project -- via a function that is passed in
  // - [ ] it will contact runner to run project -- write that here.
  const { projects, runners } = await state({ client });

  const getClient = async (project_id: string) => {
    const cutoff = Date.now() - UPDATE_INTERVAL * 2.5;

    const cur = projects.get(project_id);
    if (cur != null && cur.state != "opened") {
      const { server } = cur;
      if (server) {
        const s = runners.get(server);
        if ((s?.time ?? 0) > cutoff) {
          return projectRunnerClient({
            client,
            subject: `project-runner.${server}`,
          });
        }
      }
    }
    const v: { time: number; server: string }[] = [];
    const k = runners.getAll();
    for (const server in k) {
      if ((k[server].time ?? 0) <= cutoff) {
        continue;
      }
      v.push({ ...k[server], server });
    }
    v.sort(field_cmp("time"));
    v.reverse();

    if (v.length == 0) {
      throw Error("no project runners available -- try again later");
    }
    // this is a very dumb first attempt; it should also try another server in case a server isn't reachable
    const server = randomChoice(new Set(v)).server;
    logger.debug("getClient -- assigning to ", { project_id, server });
    return projectRunnerClient({
      client,
      subject: `project-runner.${server}`,
    });
  };

  const getProjectId = (t: any) => {
    const subject = t.subject as string;
    const project_id = subject.split(".")[1];
    return project_id;
  };

  const setState1 =
    setState == null
      ? undefined
      : async (opts: { project_id: string; state: ProjectState }) => {
          if (setState == null) {
            return;
          }
          try {
            await setState(opts);
          } catch (err) {
            logger.debug(`WARNING: issue calling setState`, opts, err);
          }
        };

  const sub = await client.service<API>(subject, {
    async start() {
      const project_id = getProjectId(this);
      logger.debug("start", project_id);
      const config = await getConfig?.({ project_id });
      const runClient = await getClient(project_id);
      await setState1?.({ project_id, state: "starting" });
      await runClient.start({ project_id, config });
      await setState1?.({ project_id, state: "running" });
    },

    async stop({ force }: { force?: boolean } = {}) {
      const project_id = getProjectId(this);
      logger.debug("stop", project_id);
      const runClient = await getClient(project_id);
      try {
        await runClient.stop({ project_id, force });
        await setState1?.({ project_id, state: "opened" });
      } catch (err) {
        if (err.code == 503) {
          // the runner is no longer running, so obviously project isn't running there.
          await setState1?.({ project_id, state: "opened" });
        } else {
          // can't stop it (e.g., sync broken/disabled), so it is still running
          await setState1?.({ project_id, state: "running" });
        }
        throw err;
      }
    },

    async status() {
      const project_id = getProjectId(this);
      logger.debug("start", project_id);
      const runClient = await getClient(project_id);
      for (let i = 0; i < MAX_STATUS_TRIES; i++) {
        try {
          logger.debug("status", { project_id });
          const s = await runClient.status({ project_id });
          logger.debug("status: got ", s);
          await setState1?.({ project_id, ...s });
          return s;
        } catch (err) {
          logger.debug("status: got err", err);
          if (i < MAX_STATUS_TRIES - 1) {
            logger.debug("status: waiting 3s and trying again...");
            await delay(3000);
            continue;
          }
          if (err.code == 503) {
            logger.debug(
              "status: running is no longer running -- giving up on project",
            );
            // the runner is no longer running, so obviously project isn't running there.
            await setState1?.({ project_id, state: "opened" });
          }
          logger.debug("status: reporting error");
          throw err;
        }
      }
      logger.debug("status: bug");
      throw Error("bug");
    },
  });

  return {
    close: () => {
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
