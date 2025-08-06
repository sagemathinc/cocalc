/*
Service to run a CoCalc project.

Tests are in

 - packages/backend/conat/test/project
 - packages/project/conat/test/project

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";

interface ProjectStatus {
  state: "running" | "stopped";
}

interface Options {
  subject: string;
  client?: Client;
  start: (opts: { project_id: string }) => Promise<void>;
  stop: (opts: { project_id: string }) => Promise<void>;
  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
}

interface API {
  start: (opts: { project_id: string }) => Promise<void>;
  stop: (opts: { project_id: string }) => Promise<void>;
  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
}

export async function projectRunnerServer({
  subject,
  client,
  start,
  stop,
  status,
}: Options) {
  client ??= conat();
  const sub = await client.service<API>(subject, {
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
  return {
    close: () => {
      sub.close();
    },
  };
}

export function projectRunnerClient({
  client,
  subject,
}: {
  client?: Client;
  subject: string;
}): API {
  client ??= conat();
  return client.call<API>(subject);
}
