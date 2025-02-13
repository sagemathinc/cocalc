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
}: {
  createKey?: (opts: Options) => string;
  createObject: (opts: Options) => Promise<T>;
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
      return cache[key];
    }
    const obj = await createObjectReuseInFlight(opts);
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
}: {
  createKey?: (opts: Options) => string;
  createObject: (opts: Options) => T;
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
      return cache[key];
    }
    const obj = createObject(opts);
    // we are *the* one setting things up.
    cache[key] = obj;
    count[key] = 1;
    close[key] = obj.close;
    obj.close = () => {
      count[key] -= 1;
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
