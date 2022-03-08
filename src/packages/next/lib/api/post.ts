import basePath from "lib/base-path";
import { join } from "path";
import LRU from "lru-cache";

const VERSION = "v2";

export default async function apiPost(
  path: string,
  data?: object,
  cache_s: number = 0 // if given, cache results for this many seconds to avoid overfetching
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
  try {
    result = await response.json();
    if (result.error) {
      // if error is set in response, then just through exception (this greatly simplifies client code).
      throw Error(result.error);
    }
  } catch (err) {
    console.log(response);
    if (response.statusText == "Not Found") {
      throw Error(`The API endpoint ${path} does not exist`);
    }
    throw err;
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
      maxAge: 1000 * seconds,
      max: 200,
    });
  }
  return caches[seconds];
}
