import LRU from "lru-cache";
import { getTitle as getTitleViaApi } from "./api";

// Get title *and* color of a compute server you own.
// This is only meant to be used for purchase history, etc.,
// so the result is cached for a few minutes, and it's
// an error if you don't own the server.

const cache = new LRU<number, { title: string; color: string }>({
  max: 1000,
  ttl: 1000 * 60 * 3,
});

export default async function getTitle(
  compute_server_id: number,
): Promise<{ title: string; color: string }> {
  if (cache.has(compute_server_id)) {
    return cache.get(compute_server_id)!;
  }
  const x = await getTitleViaApi({ id: compute_server_id });
  cache.set(compute_server_id, x);
  return x;
}
