/*
File formatting service.
*/

import { run_formatter, type Options } from "../formatters";
import { createFormatterService as create } from "@cocalc/nats/service/formatter";
import { compute_server_id, project_id } from "@cocalc/project/data";

interface Message {
  path: string;
  options: Options;
}

export async function createFormatterService({ openSyncDocs }) {
  const impl = {
    formatter: async (opts: Message) => {
      const syncstring = openSyncDocs[opts.path];
      if (syncstring == null) {
        throw Error(`"${opts.path}" is not opened`);
      }
      return await run_formatter({ ...opts, syncstring });
    },
  };
  return await create({ compute_server_id, project_id, impl });
}
