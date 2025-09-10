import { type System, system } from "./system";
import { type Editor, editor } from "./editor";
import { type Jupyter, jupyter } from "./jupyter";
import { type Sync, sync } from "./sync";
import { handleErrorMessage } from "@cocalc/conat/util";
export { projectApiClient } from "./project-client";

export interface ProjectApi {
  system: System;
  editor: Editor;
  jupyter: Jupyter;
  sync: Sync;
  isRunning: () => Promise<boolean>;
}

const ProjectApiStructure = {
  system,
  editor,
  jupyter,
  sync,
} as const;

export function initProjectApi(callProjectApi, isRunning): ProjectApi {
  const projectApi: any = {};
  for (const group in ProjectApiStructure) {
    if (projectApi[group] == null) {
      projectApi[group] = {};
    }
    for (const functionName in ProjectApiStructure[group]) {
      projectApi[group][functionName] = async (...args) =>
        handleErrorMessage(
          await callProjectApi({
            name: `${group}.${functionName}`,
            args,
          }),
        );
    }
  }
  projectApi.isRunning = isRunning;
  return projectApi as ProjectApi;
}
