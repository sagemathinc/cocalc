/*
Multiresponse request/response conat server that makes
llm's available to users of CoCalc.

Query with a multiResponse request at this subject

    llm.account-{account_id}

We will also support llm.project-{project_id} at some point to make
it so projects can directly use llm's... but first we need to figure out
how paying for that would work.
*/

import { conat } from "@cocalc/conat/client";
import { isValidUUID } from "@cocalc/util/misc";
import type { Subscription } from "@cocalc/conat/core/client";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:llm:server");

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
  const cn = await conat();
  sub = await cn.subscribe(`${SUBJECT}.*.api`, { queue: "q" });
  listen(evaluate);
}

export async function close() {
  if (sub == null) {
    return;
  }
  sub.close();
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

  let seq = -1;
  const respond = async ({
    text,
    error,
  }: {
    text?: string;
    error?: string;
  }) => {
    seq += 1;
    try {
      await mesg.respond({ text, error, seq });
    } catch (err) {
      logger.debug("WARNING: error sending response -- ", err);
      end();
    }
  };

  let done = false;
  const end = async () => {
    if (done) return;
    done = true;
    // end response stream with null payload -- send sync, or it could
    // get sent before the responses above, which would cancel them out!
    await mesg.respond(null, { noThrow: true });
  };

  const stream = async (text?) => {
    if (done) return;
    if (text != null) {
      await respond({ text });
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
