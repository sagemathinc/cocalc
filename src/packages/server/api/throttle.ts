/*
Very simple throttle protocol.  We could make this more complicated later if necessary.
*/

import LRU from "lru-cache";

const cache = new LRU<string, number>({ max: 50000, ttl: 1000 * 60 * 60 });

export default function throttle({
  account_id,
  endpoint,
  interval = 10000,
}: {
  account_id: string;
  endpoint: string;
  interval?: number;
}) {
  const key = `${account_id}${endpoint}`;
  const now = Date.now();
  if (!cache.has(key) || now - cache.get(key)! > interval) {
    cache.set(key, now);
    return;
  }
  throw Error(`too many requests to ${endpoint}; try again later`);
}
