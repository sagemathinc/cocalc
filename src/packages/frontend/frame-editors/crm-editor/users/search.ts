import LRU from "lru-cache";
import { webapp_client } from "@cocalc/frontend/webapp-client";

const cache = new LRU<string, any>({ max: 30, ttl: 1000 * 2 * 60 });

export default async function search(opts) {
  const key = JSON.stringify(opts);
  if (cache.has(key)) {
    return cache.get(key);
  }
  const result = await webapp_client.users_client.user_search(opts);
  cache.set(key, result);
  return result;
}
