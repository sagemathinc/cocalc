/*
Returns absolute url, e.g., https://cocalc.com or https://cocalc.com/{path}

optional path may or may not start with a /, either way is fine.
*/

import { getServerSettings } from "@cocalc/database/settings";
import basePath from "@cocalc/backend/base-path";

let cache = "";
export default async function url(path?: string) {
  if (!cache) {
    const { dns } = await getServerSettings();
    cache = dns.startsWith("http") ? dns : `https://${dns}`;
    if (basePath?.length) {
      cache += basePath;
    }
    // it must not end in '/''
    while (cache.endsWith("/")) {
      cache = cache.slice(0, cache.length - 1);
    }
  }
  if (!path) {
    return cache;
  }

  return cache + (path[0] != "/" ? "/" : "") + path;
}
