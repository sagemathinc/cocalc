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
import { delay } from "awaiting";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:project:runner:load-balancer");

const MAX_STATUS_TRIES = 3;
const TIMEOUT = 30 * 60 * 1000;

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
  move: (opts?: { force?: boolean; server?: string }) => Promise<void>;
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
    if (cur?.server) {
      const { server } = cur;
      const s = runners.get(server);
      if ((s?.time ?? 0) > cutoff) {
        return projectRunnerClient({
          client,
          subject: `project-runner.${server}`,
          timeout: TIMEOUT,
        });
      } else {
        throw Error(`project server '${server}' is not responding`);
      }
    }
    const v = getActiveRunners(runners);
    if (v.length == 0) {
      throw Error("no project runners available -- try again later");
    }

    // Project assignment: just random for now:
    const server = randomChoice(new Set(v));
    logger.debug("getClient -- assigning to ", { project_id, server });
    return projectRunnerClient({
      client,
      subject: `project-runner.${server}`,
      timeout: TIMEOUT,
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
    async move({ force, server }: { force?: boolean; server?: string } = {}) {
      const project_id = getProjectId(this);
      logger.debug("move", project_id);
      const cur = projects.get(project_id);
      if (cur == null || !cur.server) {
        // it is not assigned to a server, so nothing to do.
        return;
      }
      const setNewServer = async () => {
        if (!server) {
          const v = getActiveRunners(runners).filter(
            (server) => server != cur?.server,
          );
          server = v.length == 0 ? undefined : randomChoice(new Set(v));
        }
        projects.set(project_id, { server, state: "opened" });
        await setState1?.({ project_id, state: "opened" });
      };

      let runClient;
      try {
        runClient = await getClient(project_id);
      } catch (err) {
        if (!force) {
          throw err;
        }
      }
      try {
        const status = await runClient.status({ project_id });
        if (status?.state == "opened") {
          await setNewServer();
          return;
        }
      } catch (err) {
        if (!force) {
          throw err;
        }
      }
      try {
        await setState1?.({ project_id, state: "stopping" });
        await runClient.stop({ project_id, force });
      } catch (err) {
        if (!force) {
          await setState1?.({ project_id, state: "running" });
          throw err;
        }
      }
      await setNewServer();
    },

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
      logger.debug("status", project_id);
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

function getActiveRunners(runners): string[] {
  const cutoff = Date.now() - UPDATE_INTERVAL * 2.5;
  const k = runners.getAll();
  const v: string[] = [];
  for (const server in k) {
    if ((k[server].time ?? 0) <= cutoff) {
      continue;
    }
    v.push(server);
  }
  return v;
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
