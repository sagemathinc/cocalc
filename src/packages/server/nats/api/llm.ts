import { evaluate as evaluateStreaming } from "@cocalc/server/llm/index";
import type { ChatOptionsApi } from "@cocalc/util/types/llm";
import { jetstreamManager, type StoreCompression } from "@nats-io/jetstream";
import { getConnection } from "@cocalc/backend/nats";
import { isValidUUID } from "@cocalc/util/misc";
import { v4 } from "uuid";

const ONE_MINUTE_IN_NANOS = 1000 * 1000 * 1000 * 60;

export async function evaluate(
  options: ChatOptionsApi,
): Promise<{ subject: string; streamName: string }> {
  if (!options.system?.trim()) {
    // I noticed in testing that for some models they just fail, so let's be clear immediately.
    throw Error("the system prompt MUST be nonempty");
  }
  if (!isValidUUID(options.account_id)) {
    throw Error("account_id must be a valid uuid");
  }

  const id = v4().slice(0, 8);
  const streamName = `llm-account-${options.account_id}`;
  const subject = `llm.account-${options.account_id}.${id}`;
  const nc = await getConnection();
  const jsm = await jetstreamManager(nc);
  const streamOptions = {
    subjects: [subject],
    compression: "s2" as StoreCompression,
    // max_age: browser has 5 minutes (in nanoseconds) to get their messages from the stream
    max_age: 5 * ONE_MINUTE_IN_NANOS,
  };
  try {
    await jsm.streams.add({ ...streamOptions, name: streamName });
  } catch {
    await jsm.streams.update(streamName, streamOptions);
  }

  const stream = (text: string) => {
    nc.publish(subject, text);
  };

  const f = async () => {
    try {
      await evaluateStreaming({
        ...options,
        stream,
      });
    } catch (err) {
      stream(`${err}`);
    }
  };
  f();

  return { subject, streamName };
}
