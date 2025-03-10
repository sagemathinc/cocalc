/*
A reference counting cache.

See example usage in nats/sync.
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

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
  name?: string;
}) {
  const cache: { [key: string]: T } = {};
  const count: { [key: number]: T } = {};
  const close: { [key: number]: Function } = {};
  if (createKey == null) {
    createKey = JSON.stringify;
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
      if (name) {
        console.log("refCache: cache hit", {
          name,
          key,
          count: count[key],
        });
      }
      return cache[key];
    }
    const obj = await createObjectReuseInFlight(opts);
    if (name) {
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
    obj.close = () => {
      count[key] -= 1;
      if (name) {
        console.log("refCache: close", { name, key, count: count[key] });
      }
      if (count[key] <= 0) {
        obj.close = close[key];
        obj.close?.();
        delete cache[key];
        delete count[key];
        delete close[key];
      }
    };

    return obj;
  };

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
  name?: string;
}) {
  const cache: { [key: string]: T } = {};
  const count: { [key: number]: T } = {};
  const close: { [key: number]: Function } = {};
  if (createKey == null) {
    createKey = JSON.stringify;
  }
  const get = (opts: Options): T => {
    if (opts.noCache) {
      return createObject(opts);
    }
    const key = createKey(opts);
    if (cache[key] != undefined) {
      count[key] += 1;
      if (name) {
        console.log("refCacheSync: cache hit", {
          name,
          key,
          count: count[key],
        });
      }
      return cache[key];
    }
    const obj = createObject(opts);
    if (name) {
      console.log("refCacheSync: create", { name, key });
    }
    // we are *the* one setting things up.
    cache[key] = obj;
    count[key] = 1;
    close[key] = obj.close;
    obj.close = () => {
      count[key] -= 1;
      if (name) {
        console.log("refCacheSync: close", { name, key, count: count[key] });
      }
      if (count[key] <= 0) {
        obj.close = close[key];
        obj.close?.();
        delete cache[key];
        delete count[key];
        delete close[key];
      }
    };

    return obj;
  };

  return get;
}
