/*
This seems like it will be really useful... but we're not
using it yet.
*/

import { SystemKv } from "@cocalc/nats/system";
import { JSONCodec } from "nats";
import { getConnection } from "@cocalc/backend/nats";
import { sha1 } from "@cocalc/backend/misc_node";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

let cache: SystemKv | null = null;
export const systemKv = reuseInFlight(async () => {
  if (cache != null) {
    return cache;
  }
  const jc = JSONCodec();
  const nc = await getConnection();
  cache = new SystemKv({ jc, nc, sha1 });
  await cache.init();
  return cache;
});
