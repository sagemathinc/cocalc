/*
Services in a project.
*/

import { natsService } from "./typed";

import type {
  Options as FormatterOptions,
  FormatResult,
} from "@cocalc/util/code-formatter";

// TODO: we may change it to NOT take compute server and have this listening from
// project and all compute servers... and have only the one with the file open
// actually reply.
export function formatter({ compute_server_id = 0, project_id }) {
  return natsService<{ path: string; options: FormatterOptions }, FormatResult>(
    { project_id, compute_server_id, service: "formatter" },
  );
}

interface JupyterApiMessage {
  endpoint: string;
  query?: any;
}

type JupyterApiResponse = any;

export function jupyter({ project_id, path }) {
  return natsService<JupyterApiMessage, JupyterApiResponse>({
    project_id,
    path,
    service: "api",
    description: "Jupyter notebook compute API",
  });
}
