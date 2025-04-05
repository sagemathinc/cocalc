/*
Formatting services in a project.
*/

import { createServiceClient, createServiceHandler } from "./typed";

import type {
  Options as FormatterOptions,
  FormatResult,
} from "@cocalc/util/code-formatter";

// TODO: we may change it to NOT take compute server and have this listening from
// project and all compute servers... and have only the one with the file open
// actually reply.
interface FormatterApi {
  formatter: (opts: {
    path: string;
    options: FormatterOptions;
  }) => Promise<FormatResult>;
}

export function formatterClient({ compute_server_id = 0, project_id }) {
  return createServiceClient<FormatterApi>({
    project_id,
    compute_server_id,
    service: "formatter",
  });
}

export async function createFormatterService({
  compute_server_id = 0,
  project_id,
  impl,
}: {
  project_id: string;
  compute_server_id?: number;
  impl: FormatterApi;
}) {
  return await createServiceHandler<FormatterApi>({
    project_id,
    compute_server_id,
    service: "formatter",
    description: "Code formatter API",
    impl,
  });
}
