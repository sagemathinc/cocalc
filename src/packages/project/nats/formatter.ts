/*
File formatting service.
*/

import { run_formatter, type Options } from "../formatters";
import * as services from "@cocalc/nats/service/project";
import { compute_server_id, project_id } from "@cocalc/project/data";

interface Message {
  path: string;
  options: Options;
}

const formatter = services.formatter({ compute_server_id, project_id });

export async function createFormatterService({ openSyncDocs }) {
  return formatter.listen(async (opts: Message) => {
    const syncstring = openSyncDocs[opts.path];
    if (syncstring == null) {
      throw Error(`"${opts.path}" is not opened`);
    }
    return await run_formatter({ ...opts, syncstring });
  });
}
