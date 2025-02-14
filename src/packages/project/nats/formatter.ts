/*
File formatting service.
*/

import { getClient } from "@cocalc/project/client";
import { run_formatter, type Options } from "../formatters";

interface Message {
  path: string;
  options: Options;
}

export async function createFormatterService({ openSyncDocs }) {
  const client = getClient();
  return await client.createNatsService({
    service: "formatter",
    description: "Format code in an open file.",
    handler: async (opts: Message) => {
      const syncstring = openSyncDocs[opts.path];
      if (syncstring == null) {
        throw Error(`"${opts.path}" is not opened`);
      }
      return { result: await run_formatter({ ...opts, syncstring }) };
    },
  });
}
