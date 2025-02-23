/*
Client for the nats server in server.ts.


*/

import { getEnv } from "@cocalc/nats/client";
import type { ChatOptionsApi } from "@cocalc/util/types/llm";
import { isValidUUID } from "@cocalc/util/misc";
import { llmSubject } from "./server";

export async function llm(
  options: ChatOptionsApi & { stream?: (text: string) => void },
): Promise<string> {
  if (!options.system?.trim()) {
    // I noticed in testing that for some models they just fail, so let's be clear immediately.
    throw Error("the system prompt MUST be nonempty");
  }
  if (!isValidUUID(options.account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  const subject = llmSubject({ account_id: options.account_id });

  let all = "";
  let lastSeq = -1;
  const { nc, jc } = await getEnv();
  let { stream, ...opts } = options;
  for await (const resp of await nc.requestMany(subject, jc.encode(opts), {
    maxWait: opts.timeout ?? 1000 * 60 * 10,
  })) {
    if (resp.data.length == 0) {
      break;
    }
    const { error, text, seq } = jc.decode(resp.data);
    if (error) {
      throw Error(error);
    }
    if (lastSeq + 1 != seq) {
      throw Error("missed response");
    }
    lastSeq = seq;
    stream?.(text);
    all += text;
  }

  return all;
}
