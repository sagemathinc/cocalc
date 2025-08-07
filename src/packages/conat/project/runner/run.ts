/*
Service to run a CoCalc project.

Tests are in

 - packages/backend/conat/test/project

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import { randomId } from "@cocalc/conat/names";
import state, { type ProjectStatus } from "./state";
import { until } from "@cocalc/util/async-utils";

export const UPDATE_INTERVAL = 15_000;

export interface Options {
  id?: string;
  client?: Client;
  start: (opts: { project_id: string }) => Promise<void>;
  stop: (opts: { project_id: string }) => Promise<void>;
  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
}

export interface API {
  start: (opts: { project_id: string }) => Promise<ProjectStatus>;
  stop: (opts: { project_id: string }) => Promise<ProjectStatus>;
  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
}

export async function server({
  id = randomId(),
  client,
  start,
  stop,
  status,
}: Options) {
  client ??= conat();
  const { projects, runners } = await state({ client });
  let running = true;

  until(
    () => {
      if (!running) {
        return true;
      }
      runners.set(id, { time: Date.now() });
      return false;
    },
    { min: UPDATE_INTERVAL, max: UPDATE_INTERVAL },
  );

  const sub = await client.service<API>(`project-runner.${id}`, {
    async start(opts: { project_id: string }) {
      projects.set(opts.project_id, { server: id, state: "starting" } as const);
      await start(opts);
      const s = { server: id, state: "running" } as const;
      projects.set(opts.project_id, s);
      return s;
    },
    async stop(opts: { project_id: string }) {
      projects.set(opts.project_id, { server: id, state: "stopping" } as const);
      await stop(opts);
      const s = { server: id, state: "opened" } as const;
      projects.set(opts.project_id, s);
      return s;
    },
    async status(opts: { project_id: string }) {
      const s = { ...(await status(opts)), server: id };
      projects.set(opts.project_id, s);
      return s;
    },
  });

  return {
    close: () => {
      running = false;
      runners.delete(id);
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
