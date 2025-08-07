/*
Service to load balance running cocalc projects across the runners.

Tests are in

 - packages/backend/conat/test/project

*/

import { type Client } from "@cocalc/conat/core/client";
import { randomChoice } from "@cocalc/conat/core/server";
import { conat } from "@cocalc/conat/client";
import { client as projectRunnerClient, UPDATE_INTERVAL } from "./run";
import { getLogger } from "@cocalc/conat/client";
import state, { type ProjectStatus } from "./state";
import { field_cmp } from "@cocalc/util/misc";

const logger = getLogger("conat:project:runner:load-balancer");

export interface Options {
  subject?: string;
  client?: Client;
}

export interface API {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  status: () => Promise<ProjectStatus>;
}

export async function server({ subject = "project.*.run", client }: Options) {
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

  const sub = await client.service<API>(subject, {
    async start() {
      const project_id = getProjectId(this);
      const runClient = await getClient(project_id);
      await runClient.start({ project_id });
    },
    async stop() {
      const project_id = getProjectId(this);
      const runClient = await getClient(project_id);
      await runClient.stop({ project_id });
    },
    async status() {
      const project_id = getProjectId(this);
      const runClient = await getClient(project_id);
      return await runClient.status({ project_id });
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
