/*
Service to run a CoCalc project.

Tests are in

 - packages/backend/conat/test/project

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import { randomId } from "@cocalc/conat/names";

export interface ProjectStatus {
  state: "running" | "stopped";
}

export interface Options {
  id?: string;
  client?: Client;
  start: (opts: { project_id: string }) => Promise<void>;
  stop: (opts: { project_id: string }) => Promise<void>;
  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
}

export interface API {
  start: (opts: { project_id: string }) => Promise<void>;
  stop: (opts: { project_id: string }) => Promise<void>;
  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
}

export interface RunnerStatus {
  id: string;
}

export async function server({
  id = randomId(),
  client,
  start,
  stop,
  status,
}: Options) {
  client ??= conat();
  const sub = await client.service<API>(`project-runner.${id}`, {
    async start(opts: { project_id: string }) {
      await start(opts);
    },
    async stop(opts: { project_id: string }) {
      await stop(opts);
    },
    async status(opts: { project_id: string }) {
      return await status(opts);
    },
  });

  const sub2 = await client.service<StatusApi>(`project-runner`, {
    async status() {
      return { id };
    },
  });

  return {
    close: () => {
      sub.close();
      sub2.close();
    },
  };
}

export interface StatusApi {
  status: () => Promise<RunnerStatus>;
}

export interface StatusApiMany {
  status(): AsyncGenerator<RunnerStatus>;
}

export async function getRunners({
  client,
  maxWait,
}: {
  client?: Client;
  maxWait?: number;
}): Promise<RunnerStatus[]> {
  client ??= conat();

  const f = client.callMany<StatusApiMany>("project-runner", { maxWait });
  const v: RunnerStatus[] = [];
  for await (const x of await f.status()) {
    v.push(x);
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
