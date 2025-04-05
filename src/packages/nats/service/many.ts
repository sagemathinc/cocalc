import { Empty } from "@nats-io/nats-core";
import { getMaxPayload } from "@cocalc/nats/util";

export async function respondMany({ mesg, nc, data }) {
  const maxPayload = getMaxPayload(nc);
  for (let i = 0; i < data.length; i += maxPayload) {
    const slice = data.slice(i, i + maxPayload);
    await mesg.respond(slice);
  }
  await mesg.respond(Empty);
}

export async function requestMany({
  nc,
  subject,
  data,
  maxWait,
}: {
  nc;
  subject: string;
  data: Buffer;
  maxWait?: number;
}): Promise<{ data: Buffer }> {
  const v: any[] = [];
  for await (const resp of await nc.requestMany(subject, data, {
    maxWait,
  })) {
    if (resp.data.length == 0) {
      break;
    }
    v.push(resp);
  }
  const respData = Buffer.concat(v.map((x) => x.data));
  return { data: respData };
}
