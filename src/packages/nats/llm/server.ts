/*
Multiresponse request/response NATS server that makes
llm's available to users of CoCalc.

Query with a multiResponse request at this subject

    llm.account-{account_id}

We will also support llm.project-{project_id} at some point to make
it so projects can directly use llm's... but first we need to figure out
how paying for that would work.
*/

import { getEnv } from "@cocalc/nats/client";
import { isValidUUID } from "@cocalc/util/misc";
import type { Subscription } from "@cocalc/nats/server/client";

export const SUBJECT = process.env.COCALC_TEST_MODE ? "llm-test" : "llm";

export function llmSubject({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id?: string;
}) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.api`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.api`;
  } else {
    return `${SUBJECT}.hub.api`;
  }
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
export async function init(evaluate) {
  const { cn } = await getEnv();
  sub = await cn.subscribe(`${SUBJECT}.*.api`, { queue: "q" });
  listen(evaluate);
}

export async function close() {
  if (sub == null) {
    return;
  }
  sub.drain();
  sub = null;
}

async function listen(evaluate) {
  if (sub == null) {
    throw Error("must init first");
  }
  for await (const mesg of sub) {
    handleMessage(mesg, evaluate);
  }
}

async function handleMessage(mesg, evaluate) {
  const options = mesg.data;

  let seq = 0;
  const respond = ({ text, error }: { text?: string; error?: string }) => {
    mesg.respond({ text, error, seq });
    seq += 1;
  };

  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    // end response stream with null payload.
    mesg.respond(null);
  };

  const stream = (text?) => {
    if (done) return;
    if (text != null) {
      respond({ text });
    } else {
      end();
    }
  };

  try {
    // SECURITY: verify that the account_id claimed in options matches
    // with the subject the user published on (which proves they are who they say):
    // TODO: support project_id equally here.
    if (!isValidUUID(options.account_id)) {
      throw Error("account_id must be a valid uuid");
    }
    if (options.account_id != getUserId(mesg.subject)) {
      throw Error("account_id is invalid");
    }
    // NOTE: this evaluate does NOT await until all evaluation is done.
    // Instead evaluation is terminated by stream(undefined)!!
    await evaluate({ ...options, stream });
  } catch (err) {
    if (!done) {
      respond({ error: `${err}` });
      end();
    }
  }
}
