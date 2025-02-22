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
import { type Subscription, Empty } from "@nats-io/nats-core";

let sub: Subscription | null = null;
export async function init(evaluate) {
  const { nc } = await getEnv();
  sub = nc.subscribe("llm.*");
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
  const { jc } = await getEnv();
  const options = jc.decode(mesg.data);
  let seq = 0;
  const stream = ({ text, error }: { text?: string; error?: string }) => {
    mesg.respond(jc.encode({ text, error, seq }));
    seq += 1;
  };
  try {
    await evaluate({ ...options, stream });
  } catch (err) {
    stream({ error: `${err}` });
  } finally {
    // end respons stream with empty payload.
    mesg.respond(Empty);
  }
}
