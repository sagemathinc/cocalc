import { callback2 } from "@cocalc/util/async-utils";

export default async function query(client, opts) {
  if (opts.changes) {
    // maybe they could be; however, there's no good use case (?).
    throw Error("changefeeds are not supported for api queries");
  }
  return await callback2(client.query.bind(client), opts);
}
