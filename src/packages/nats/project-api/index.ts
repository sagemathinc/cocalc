import { type System, system } from "./system";

export interface ProjectApi {
  system: System;
}

const ProjectApiStructure = {
  system,
} as const;

export function initProjectApi(callProjectApi): ProjectApi {
  const projectApi: any = {};
  for (const group in ProjectApiStructure) {
    if (projectApi[group] == null) {
      projectApi[group] = {};
    }
    for (const functionName in ProjectApiStructure[group]) {
      projectApi[group][functionName] = async (...args) =>
        await callProjectApi({
          name: `${group}.${functionName}`,
          args,
        });
    }
  }
  return projectApi as ProjectApi;
}
