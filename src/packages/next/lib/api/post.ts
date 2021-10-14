import basePath from "lib/base-path";
import { join } from "path";
import LRU from "lru-cache";


const cache = new LRU<string, HostInfo | null>({
  maxAge: 1000 * 60,
});

const VERSION = "v2";

export default async function apiPost(
  path: string,
  data: object,
  cache_s: number = 0 // if given, cache results for this many seconds to avoid overfetching of certain things
): Promise<{ [key: string]: any }> {
  console.log("API ", { path, data });
  const response = await fetch(join(basePath, "api", VERSION, path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  try {
    return await response.json();
  } catch (err) {
    console.log(response);
    throw err;
  }
}
