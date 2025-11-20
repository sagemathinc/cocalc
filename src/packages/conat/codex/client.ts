import { conat } from "@cocalc/conat/client";
import { type Client } from "@cocalc/conat/core/client";
import { isValidUUID } from "@cocalc/util/misc";
import type { CodexRequest, CodexStreamMessage, Usage } from "./types";
import { codexSubject } from "./server";

interface StreamOptions {
  timeout?: number;
}

export async function* streamCodex(
  request: CodexRequest,
  options: StreamOptions = {},
  client?: Client,
): AsyncGenerator<CodexStreamMessage> {
  const { timeout = 1000 * 60 * 60 * 2 } = options;

  if (!isValidUUID(request.account_id)) {
    throw Error("account_id must be a valid uuid");
  }

  const subject = codexSubject({ account_id: request.account_id });
  const cn = client ?? (await conat());
  let seq = -1;

  const payload = {
    ...request,
  };

  for await (const resp of await cn.requestMany(subject, payload, {
    maxWait: timeout,
  })) {
    if (resp.data == null) {
      break;
    }
    const message = resp.data as CodexStreamMessage;
    if (message.seq !== seq + 1) {
      throw Error("missed codex response");
    }
    seq = message.seq;
    yield message;
  }
}

export async function runCodex(
  request: CodexRequest,
  options: StreamOptions = {},
  client?: Client,
): Promise<{
  finalResponse: string;
  usage: Usage | null;
  threadId: string | null;
  events: CodexStreamMessage[];
}> {
  const events: CodexStreamMessage[] = [];
  let finalResponse = "";
  let usage: Usage | null = null;
  let threadId: string | null = null;

  for await (const message of streamCodex(request, options, client)) {
    events.push(message);
    if (message.type === "summary") {
      finalResponse = message.finalResponse;
      usage = message.usage ?? null;
      threadId = message.threadId ?? null;
    } else if (message.type === "error") {
      throw Error(message.error);
    }
  }

  return { finalResponse, usage, threadId, events };
}
