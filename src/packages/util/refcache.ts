/*
A reference counting cache.

See example usage in nats/sync.
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import jsonStableStringify from "json-stable-stringify";
const VERBOSE = false;

export const caches: { [name: string]: any } = {};

export function info() {
  const x: any = {};
  for (const name in caches) {
    x[name] = caches[name].info();
  }
  return x;
}

export default function refCache<
  Options extends { noCache?: boolean },
  T extends { close: () => void },
>({
  createKey,
  createObject,
  name,
}: {
  createKey?: (opts: Options) => string;
  createObject: (opts: Options) => Promise<T>;
  name: string;
}) {
  const cache: { [key: string]: T } = {};
  const count: { [key: string]: number } = {};
  const close: { [key: number]: Function } = {};
  if (createKey == null) {
    createKey = jsonStableStringify;
  }
  const createObjectReuseInFlight = reuseInFlight(createObject, {
    createKey: (args) => createKey(args[0]),
  });

  const get = async (opts: Options): Promise<T> => {
    if (opts.noCache) {
      return await createObject(opts);
    }
    const key = createKey(opts);
    if (cache[key] != undefined) {
      count[key] += 1;
      if (VERBOSE) {
        console.log("refCache: cache hit", {
          name,
          key,
          count: count[key],
        });
      }
      return cache[key];
    }
    const obj = await createObjectReuseInFlight(opts);
    if (VERBOSE) {
      console.log("refCache: create", { name, key });
    }
    if (cache[key] != null) {
      // it's possible after the above await that a
      // different call to get already setup the cache, count, etc.
      count[key] += 1;
      return cache[key];
    }
    // we are *the* one setting things up.
    cache[key] = obj;
    count[key] = 1;
    close[key] = obj.close;
    obj.close = async () => {
      count[key] -= 1;
      if (VERBOSE) {
        console.log("refCache: close", { name, key, count: count[key] });
      }
      // make it so calling close again is a no-op
      if (count[key] <= 0) {
        close[key]?.();
        delete cache[key];
        delete count[key];
        delete close[key];
        if (count[key] < 0) {
          console.warn(
            "WARNING: bug called .close() too many times on an object",
            { name, key },
          );
        }
      }
    };

    return obj;
  };
  get.info = () => {
    return { name, count: { ...count } };
  };

  caches[name] = get;
  return get;
}

export function refCacheSync<
  Options extends { noCache?: boolean },
  T extends { close: () => void },
>({
  createKey,
  createObject,
  name,
}: {
  createKey?: (opts: Options) => string;
  createObject: (opts: Options) => T;
  name: string;
}) {
  const cache: { [key: string]: T } = {};
  const count: { [key: string]: number } = {};
  const close: { [key: number]: Function } = {};
  if (createKey == null) {
    createKey = jsonStableStringify;
  }
  const get = (opts: Options): T => {
    if (opts.noCache) {
      return createObject(opts);
    }
    const key = createKey(opts);
    if (cache[key] != undefined) {
      count[key] += 1;
      if (VERBOSE) {
        console.log("refCacheSync: cache hit", {
          name,
          key,
          count: count[key],
        });
      }
      return cache[key];
    }
    const obj = createObject(opts);
    if (VERBOSE) {
      console.log("refCacheSync: create", { name, key });
    }
    // we are *the* one setting things up.
    cache[key] = obj;
    count[key] = 1;
    close[key] = obj.close;
    obj.close = async () => {
      count[key] -= 1;
      if (VERBOSE) {
        console.log("refCacheSync: close", { name, key, count: count[key] });
      }
      if (count[key] <= 0) {
        await close[key]?.();
        delete cache[key];
        delete count[key];
        delete close[key];
        if (count[key] < 0) {
          console.warn(
            "WARNING: bug called .close() too many times on an object",
            { name, key },
          );
        }
      }
    };

    return obj;
  };
  get.info = () => {
    return { name, count: { ...count } };
  };
  caches[name] = get;
  return get;
}
