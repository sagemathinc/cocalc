/*
The shared persistent state used by the load
balancer and all the project runners.

From the backend package:

 client = require('@cocalc/backend/conat').conat();  a = require('@cocalc/conat/project/runner/state'); s = await a.default(client)
*/

import { dkv } from "@cocalc/conat/sync/dkv";

export interface RunnerStatus {
  time: number;
}

export type ProjectState =
  | "opened"
  | "starting"
  | "running"
  | "stopping";

export interface ProjectStatus {
  server?: string;
  state: ProjectState;
  publicKey?: string;
}

export default async function state({ client }) {
  return {
    projects: await dkv<{ server?: string; state: ProjectState }>({
      client,
      name: "project-runner.projects",
    }),

    runners: await dkv<RunnerStatus>({
      client,
      name: "project-runner.runners",
    }),
  };
}
