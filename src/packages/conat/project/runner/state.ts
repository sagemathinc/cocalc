// get the shared state used by the load balancer and all the project runners

import { dkv } from "@cocalc/conat/sync/dkv";

export interface RunnerStatus {
  time: number;
}

export type ProjectState = "running" | "opened" | "stopping" | "starting";
export interface ProjectStatus {
  server?: string;
  state: ProjectState;
  ip?: string; // the ip address when running
}

export default async function state({ client }) {
  return {
    projects: await dkv<ProjectStatus>({
      client,
      name: "project-runner.projects",
    }),
    runners: await dkv<RunnerStatus>({
      client,
      name: "project-runner.runners",
    }),
  };
}
