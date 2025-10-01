import basePath from "lib/base-path";
import LRU from "lru-cache";
import { join } from "path";

const VERSION = "v2";

export default async function apiPost(
  path: string,
  data?: object,
  cache_s: number = 0, // if given, cache results for this many seconds to avoid overfetching
): Promise<any> {
  let cache, key;
  if (cache_s) {
    cache = getCache(cache_s);
    key = JSON.stringify({ path, data });
    if (cache.has(key)) {
      return cache.get(key);
    }
  }

  const response = await fetch(join(basePath, "api", VERSION, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  let result;
  const respClone = response.clone();
  try {
    result = await response.json();
    if (result.error) {
      // if error is set in response, then just throw exception (this greatly simplifies client code).
      throw Error(result.error);
    }
    if (result.errors) {
      // This happens with zod schema errors, e.g., try creating an account with email a@b.c,
      // which violates the schema for email in zod.
      throw Error(JSON.stringify(result.errors));
    }
  } catch (err) {
    if (response.statusText == "Not Found") {
      throw Error(`The API endpoint ${path} does not exist`);
    }
    let r;
    try {
      r = await respClone.text();
    } catch {
      r = undefined;
    }
    if (r) {
      throw Error(r);
    } else {
      throw err;
    }
  }
  if (cache_s) {
    cache.set(key, result);
  }

  return result;
}

const caches: { [seconds: number]: LRU<string, object> } = {};

function getCache(seconds: number) {
  if (!caches[seconds]) {
    caches[seconds] = new LRU<string, object>({
      ttl: 1000 * seconds,
      max: 200,
    });
  }
  return caches[seconds];
}
