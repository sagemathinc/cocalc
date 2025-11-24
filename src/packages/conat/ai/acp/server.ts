import { conat } from "@cocalc/conat/client";
import type { Subscription } from "@cocalc/conat/core/client";
import { getLogger } from "@cocalc/conat/client";
import { isValidUUID } from "@cocalc/util/misc";
import type { AcpRequest, AcpStreamPayload } from "./types";

const logger = getLogger("conat:ai:acp:server");

const SUBJECT = process.env.COCALC_ACP_TEST ? "acp-test" : "acp";

export function acpSubject({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id?: string;
}): string {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.api`;
  }
  if (project_id) {
    return `${SUBJECT}.project-${project_id}.api`;
  }
  return `${SUBJECT}.hub.api`;
}

function getUserId(subject: string): string {
  if (subject.startsWith(`${SUBJECT}.account-`)) {
    return subject.slice(
      `${SUBJECT}.account-`.length,
      `${SUBJECT}.account-`.length + 36,
    );
  }
  if (subject.startsWith(`${SUBJECT}.project-`)) {
    return subject.slice(
      `${SUBJECT}.project-`.length,
      `${SUBJECT}.project-`.length + 36,
    );
  }
  return "hub";
}

let sub: Subscription | null = null;

type StreamHandler = (payload?: AcpStreamPayload | null) => Promise<void>;

type EvaluateHandler = (
  options: AcpRequest & { stream: StreamHandler },
) => Promise<void>;

export async function init(evaluate: EvaluateHandler, client): Promise<void> {
  client ??= await conat();
  sub = await client.subscribe(`${SUBJECT}.*.api`, { queue: "acp-q" });
  listen(evaluate);
}

export async function close(): Promise<void> {
  if (sub == null) return;
  sub.close();
  sub = null;
}

async function listen(evaluate: EvaluateHandler): Promise<void> {
  if (sub == null) throw Error("must init first");
  for await (const mesg of sub) {
    handleMessage(mesg, evaluate);
  }
}

async function handleMessage(mesg, evaluate: EvaluateHandler) {
  const options = mesg.data ?? {};

  let done = false;
  let seq = -1;
  const respond = async (payload?: any, error?: string) => {
    if (done) return;

    seq += 1;
    const data: any = {
      seq,
      ...(payload ?? {}),
    };
    if (error) {
      data.error = error;
      data.type = "error";
    }
    try {
      await mesg.respond(data);
    } catch (err) {
      logger.debug(`ACP respond failed -- ${err}`);
      await end();
    }
  };

  const end = async () => {
    if (done) return;
    done = true;
    await mesg.respond(null, { noThrow: true });
  };

  const stream: StreamHandler = async (payload) => {
    if (done) return;
    if (payload == null) {
      await end();
    } else {
      await respond(payload);
    }
  };

  try {
    if (!isValidUUID(options.account_id)) {
      throw Error("account_id must be a valid uuid");
    }
    if (options.account_id !== getUserId(mesg.subject)) {
      throw Error("account_id is invalid");
    }

    await evaluate({
      ...options,
      prompt: options.prompt ?? "",
      stream,
    });
    await stream(null);
  } catch (err) {
    if (!done) {
      await respond(undefined, `${err}`);
      await end();
    }
  }
}
