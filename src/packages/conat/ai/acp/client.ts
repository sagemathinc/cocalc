import { conat } from "@cocalc/conat/client";
import type { Client } from "@cocalc/conat/core/client";
import { isValidUUID } from "@cocalc/util/misc";
import type { AcpRequest, AcpStreamMessage } from "./types";
import { acpSubject } from "./server";

interface StreamOptions {
  timeout?: number;
}

export async function* streamAcp(
  request: AcpRequest,
  options: StreamOptions = {},
  client?: Client,
): AsyncGenerator<AcpStreamMessage> {
  const { timeout = 1000 * 60 * 60 * 2 } = options;

  if (!isValidUUID(request.account_id)) {
    throw Error("account_id must be a valid uuid");
  }

  const subject = acpSubject({ account_id: request.account_id });
  const cn = client ?? (await conat());
  let seq = -1;

  for await (const resp of await cn.requestMany(subject, request, {
    maxWait: timeout,
  })) {
    if (resp.data == null) break;
    const message = resp.data as AcpStreamMessage;
    if (message.seq !== seq + 1) {
      throw Error("missed acp response");
    }
    seq = message.seq;
    yield message;
  }
}

export async function runAcp(
  request: AcpRequest,
  options: StreamOptions = {},
  client?: Client,
): Promise<{
  finalResponse: string;
  threadId: string | null;
  events: AcpStreamMessage[];
}> {
  const events: AcpStreamMessage[] = [];
  let finalResponse = "";
  let threadId: string | null = null;

  for await (const message of streamAcp(request, options, client)) {
    events.push(message);
    if (message.type === "summary") {
      finalResponse = message.finalResponse;
      threadId = message.threadId ?? null;
    } else if (message.type === "event") {
      continue;
    }
  }

  return { finalResponse, threadId, events };
}
