import { type System, system } from "./system";
import { type Terminal, terminal } from "./terminal";
import { handleErrorMessage} from "@cocalc/nats/util";

export interface ProjectApi {
  system: System;
  terminal: Terminal;
}

const ProjectApiStructure = {
  system,
  terminal,
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
