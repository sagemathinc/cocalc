import { type System, system } from "./system";
import { type Editor, editor } from "./editor";
import { type Sync, sync } from "./sync";
import { handleErrorMessage } from "@cocalc/conat/util";

export interface ProjectApi {
  system: System;
  editor: Editor;
  sync: Sync;
}

const ProjectApiStructure = {
  system,
  editor,
  sync,
} as const;

export function initProjectApi(callProjectApi): ProjectApi {
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
  return projectApi as ProjectApi;
}
