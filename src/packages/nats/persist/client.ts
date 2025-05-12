import { getEnv } from "@cocalc/nats/client";
import { isValidUUID } from "@cocalc/util/misc";
import { persistSubject, renewSubject, LAST_CHUNK, type User } from "./server";
import { waitUntilConnected } from "@cocalc/nats/util";
export { DEFAULT_LIFETIME } from "./server";

export async function* persist({
  account_id,
  project_id,
  path,
  options,
  heartbeat,
  lifetime,
  maxActualLifetime = 1000 * 60 * 60 * 2,
}: {
  // TODO
  path: string;
  options?: any[];

  // maximum amount of time the persist can possibly stay alive, even with
  // many calls to extend it.
  maxActualLifetime?: number;
  // server will send resp='' to ensure there is at least one message every this many ms.
  heartbeat?: number;
  // persist will live at most this long, then definitely die.
  lifetime?: number;
} & User) {
  if (!isValidUUID(account_id) && !isValidUUID(project_id)) {
    throw Error("account_id or project_id must be a valid uuid");
  }
  const subject = persistSubject({ account_id, project_id } as User);

  let lastSeq = -1;
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  const chunks: Uint8Array[] = [];
  for await (const mesg of await nc.requestMany(
    subject,
    jc.encode({ path, options, heartbeat, lifetime }),
    { maxWait: maxActualLifetime },
  )) {
    if (mesg.data.length == 0) {
      // done
      return;
    }
    chunks.push(mesg.data);
    if (!isLastChunk(mesg)) {
      continue;
    }
    const data = Buffer.concat(chunks);
    chunks.length = 0;
    const { error, resp, seq } = jc.decode(data);
    if (error) {
      throw Error(error);
    }
    if (lastSeq + 1 != seq) {
      throw Error("missed response");
    }
    lastSeq = seq;
    yield resp;
  }
}

function isLastChunk(mesg) {
  for (const [key, _] of mesg.headers ?? []) {
    if (key == LAST_CHUNK) {
      return true;
    }
  }
  return false;
}

export async function renew({
  account_id,
  project_id,
  id,
  lifetime,
}: {
  id: string;
  lifetime?: number;
} & User) {
  const subject = renewSubject({ account_id, project_id } as User);
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  const resp = await nc.request(subject, jc.encode({ id, lifetime }));
  return jc.decode(resp.data);
}
