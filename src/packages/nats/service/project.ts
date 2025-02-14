/*
Services in a project.
*/

import { natsService } from "./typed";

import type {
  Options as FormatterOptions,
  FormatResult,
} from "@cocalc/util/code-formatter";

export function formatter({ compute_server_id = 0, project_id }) {
  return natsService<{ path: string; options: FormatterOptions }, FormatResult>(
    { project_id, compute_server_id, service: "formatter" },
  );
}
