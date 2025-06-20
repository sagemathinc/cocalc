/*
Inventory of all streams and key:value stores in a specific project, account or the public space.

DEVELOPMENT:

i = await require('@cocalc/backend/nats/sync').inventory({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf'})

i.ls()

*/

import { dkv, type DKV } from "./dkv";
import { dko, type DKO } from "./dko";
import { dstream, type DStream } from "./dstream";
import getTime from "@cocalc/nats/time";
import refCache from "@cocalc/util/refcache";
import type { JSONValue } from "@cocalc/util/types";
import {
  human_readable_size as humanReadableSize,
  trunc_middle,
} from "@cocalc/util/misc";
import type { ValueType } from "@cocalc/nats/types";
import { type KVLimits } from "./general-kv";
import { type FilteredStreamLimitOptions } from "./stream";
import { DKO_PREFIX } from "./dko";
import { waitUntilTimeAvailable } from "@cocalc/nats/time";

export const THROTTLE_MS = 10000;
export const INVENTORY_NAME = "CoCalc-Inventory";

type Sort =
  | "last"
  | "created"
  | "count"
  | "bytes"
  | "name"
  | "type"
  | "valueType"
  | "-last"
  | "-created"
  | "-count"
  | "-bytes"
  | "-name"
  | "-type"
  | "-valueType";

interface Location {
  account_id?: string;
  project_id?: string;
}

type StoreType = "kv" | "stream";

interface Item {
  // when it was created
  created: number;
  // last time this kv-store was updated
  last: number;
  // how much space is used by this kv-store
  bytes: number;
  // number of keys or messages
  count: number;
  // optional description, which can be anything
  desc?: JSONValue;
  // type of values stored
  valueType?: ValueType;
  // limits for purging old data
  limits?: KVLimits | FilteredStreamLimitOptions;
  // for streams, the seq number up to which this data is valid, i.e.,
  // this data is for all elements of the stream with sequence
  // number <= seq.
  seq?: number;
}

interface FullItem extends Item {
  type: StoreType;
  name: string;
}

export class Inventory {
  public location: Location;
  private dkv?: DKV<Item>;

  constructor(location: { account_id?: string; project_id?: string }) {
    this.location = location;
  }

  init = async () => {
    this.dkv = await dkv({
      name: INVENTORY_NAME,
      ...this.location,
    });
    await waitUntilTimeAvailable();
  };

  // Set but with NO LIMITS and no MERGE conflict algorithm. Use with care!
  set = ({
    type,
    name,
    bytes,
    count,
    desc,
    valueType,
    limits,
    seq,
  }: {
    type: StoreType;
    name: string;
    bytes: number;
    count: number;
    desc?: JSONValue;
    valueType: ValueType;
    limits?: KVLimits | FilteredStreamLimitOptions;
    seq?: number;
  }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    const last = getTime();
    const key = this.encodeKey({ name, type, valueType });
    const cur = this.dkv.get(key);
    const created = cur?.created ?? last;
    desc = desc ?? cur?.desc;
    this.dkv.set(key, {
      desc,
      last,
      created,
      bytes,
      count,
      limits,
      seq,
    });
  };

  private encodeKey = ({ name, type, valueType = "json" }) =>
    JSON.stringify({ name, type, valueType });

  private decodeKey = (key) => JSON.parse(key);

  delete = ({
    name,
    type,
    valueType,
  }: {
    name: string;
    type: StoreType;
    valueType?: ValueType;
  }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    this.dkv.delete(this.encodeKey({ name, type, valueType }));
  };

  get = (
    x: { name: string; type: StoreType; valueType?: ValueType } | string,
  ): (Item & { type: StoreType; name: string }) | undefined => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    let cur;
    let name, type;
    if (typeof x == "string") {
      // just the name -- we infer/guess the type and valueType
      name = x;
      type = "kv";
      for (const valueType of ["json", "binary"]) {
        cur = this.dkv.get(this.encodeKey({ name, type, valueType }));
        if (cur == null) {
          type = "stream";
          cur = this.dkv.get(this.encodeKey({ name, type, valueType }));
        }
        if (cur != null) {
          break;
        }
      }
    } else {
      name = x.name;
      cur = this.dkv.get(this.encodeKey(x));
    }
    if (cur == null) {
      return;
    }
    return { ...cur, type, name };
  };

  persist = async () => {
    const start = Date.now();
    let size = 0,
      messages = 0;
    const f = async (store) => {
      await store.persist();
    };
    const v = await this.call({
      f,
      condition: (item) => {
        console.log(item.name);
        if (
          item.name.startsWith("ipywidgets:") ||
          item.name.startsWith("termninal-") ||
          item.name == "open-files" ||
          item.name.startsWith("listings")
        ) {
          // do not bother with them -- ephemeral or format changed
          return false;
        } else {
          return true;
        }
      },
    });
    for (const key in v) {
      const value = v[key];
      if (value?.error) {
        console.log("FAILED -- ", key);
      } else {
        if (value != null) {
          size += value.size;
          messages += value.messages;
        }
      }
    }
    console.log(
      `${Date.now() - start}ms to persist ${JSON.stringify(this.location)}: ${humanReadableSize(size)} and ${messages} messages`,
    );
  };

  // call async function on every store
  call = async ({
    f,
    condition,
    filter,
    sort = "-last",
  }: {
    condition?: (item: FullItem) => boolean;
    f: (store: DKV | DStream | DKO) => Promise<any>;
    filter?: string;
    sort?: Sort;
  }): Promise<{ [key: string]: any }> => {
    const v: { [key: string]: any } = {};
    const all = this.getAll({ filter });
    for (const key of this.sortedKeys(all, sort)) {
      const x = all[key];
      if (condition != null && !condition(x)) {
        continue;
      }
      const { desc, name, type } = x;
      let store;
      try {
        console.log("loading store from NATS", key, x);
        if (type == "kv") {
          if (name.startsWith(DKO_PREFIX)) {
            store = await dko({
              name: name.slice(DKO_PREFIX.length),
              ...this.location,
              desc,
            });
          } else {
            store = await dkv({ name, ...this.location, desc });
          }
        } else if (type == "stream") {
          store = await dstream({ name, ...this.location, desc });
        } else {
          throw Error(`unknown store type '${type}'`);
        }
        console.log("calling function");
        v[key] = await f(store);
      } catch (err) {
        console.log("ERROR getting", key, err);
        v[key] = { error: `${err}` };
      } finally {
        try {
          store?.close();
        } catch {}
      }
    }
    return v;
  };

  getStores = async ({
    filter,
    sort = "-last",
  }: { filter?: string; sort?: Sort } = {}): Promise<
    (DKV | DStream | DKO)[]
  > => {
    const v: (DKV | DStream | DKO)[] = [];
    const all = this.getAll({ filter });
    for (const key of this.sortedKeys(all, sort)) {
      const x = all[key];
      const { desc, name, type } = x;
      if (type == "kv") {
        if (name.startsWith(DKO_PREFIX)) {
          if (name.startsWith(DKO_PREFIX + DKO_PREFIX)) {
            this.delete({ name, type });
            continue;
          }
          v.push(
            await dko({
              name: name.slice(DKO_PREFIX.length),
              ...this.location,
              desc,
            }),
          );
        } else {
          v.push(await dkv({ name, ...this.location, desc }));
        }
      } else if (type == "stream") {
        v.push(await dstream({ name, ...this.location, desc }));
      } else {
        throw Error(`unknown store type '${type}'`);
      }
    }
    return v;
  };

  needsUpdate = (x: {
    name: string;
    type: StoreType;
    valueType: ValueType;
  }): boolean => {
    if (this.dkv == null) {
      return false;
    }
    const cur = this.dkv.get(this.encodeKey(x));
    if (cur == null) {
      return true;
    }
    //     if (getTime() - cur.last >= 0.9 * THROTTLE_MS) {
    //       return true;
    //     }
    return true;
  };

  getAll = ({ filter }: { filter?: string } = {}): FullItem[] => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    const all = this.dkv.getAll();
    if (filter) {
      filter = filter.toLowerCase();
    }
    const v: FullItem[] = [];
    for (const key of Object.keys(all)) {
      const { name, type, valueType } = this.decodeKey(key);
      if (filter) {
        const { desc } = all[key];
        const s = `${desc ? JSON.stringify(desc) : ""} ${name}`.toLowerCase();
        if (!s.includes(filter)) {
          continue;
        }
      }
      v.push({ ...all[key], name, type, valueType });
    }
    return v;
  };

  close = async () => {
    await this.dkv?.close();
    delete this.dkv;
  };

  private sortedKeys = (all, sort0: Sort) => {
    let reverse: boolean, sort: string;
    if (sort0[0] == "-") {
      reverse = true;
      sort = sort0.slice(1);
    } else {
      reverse = false;
      sort = sort0;
    }
    // return keys of all, sorted as specified
    const x: { k: string; v: any }[] = [];
    for (const k in all) {
      x.push({ k, v: { ...all[k], ...this.decodeKey(k) } });
    }
    x.sort((a, b) => {
      const a0 = a.v[sort];
      const b0 = b.v[sort];
      if (a0 < b0) {
        return -1;
      }
      if (a0 > b0) {
        return 1;
      }
      return 0;
    });
    const y = x.map(({ k }) => k);
    if (reverse) {
      y.reverse();
    }
    return y;
  };

  ls = ({
    log = console.log,
    filter,
    noTrunc,
    path: path0,
    sort = "-last",
  }: {
    log?: Function;
    filter?: string;
    noTrunc?: boolean;
    path?: string;
    sort?: Sort;
  } = {}) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    const all = this.dkv.getAll();
    log(`
Inventory for ${JSON.stringify(this.location)}`);
    log(
      "ls(opts: {filter?: string; noTrunc?: boolean; path?: string; sort?: 'last'|'created'|'count'|'bytes'|'name'|'type'|'valueType'|'-last'|...})",
    );
    log(
      "╭──────────┬─────────────────────────────────────────────────────┬───────────────────────┬──────────────────┬──────────────────┬──────────────────┬───────────────────────╮",
    );
    log(
      `│ ${padRight("Type", 7)} │ ${padRight("Name", 50)} │ ${padRight("Created", 20)} │ ${padRight("Size", 15)} │ ${padRight("Count", 15)} │ ${padRight("Value Type", 15)} │ ${padRight("Last Update", 20)} │`,
    );
    log(
      "├──────────┼─────────────────────────────────────────────────────┼───────────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────────────┤",
    );
    for (const key of this.sortedKeys(all, sort)) {
      const { last, created, count, bytes, desc, limits } = all[key];
      if (path0 && desc?.["path"] != path0) {
        continue;
      }
      let { name, type, valueType } = this.decodeKey(key);
      if (name.startsWith(DKO_PREFIX)) {
        type = "kvobject";
        name = name.slice(DKO_PREFIX.length);
      }
      if (!noTrunc) {
        name = trunc_middle(name, 50);
      }
      if (
        filter &&
        !`${desc ? JSON.stringify(desc) : ""} ${name}`
          .toLowerCase()
          .includes(filter.toLowerCase())
      ) {
        continue;
      }
      log(
        `│ ${padRight(type ?? "-", 7)} │ ${padRight(name, 50)} │ ${padRight(dateToString(new Date(created)), 20)} │ ${padRight(humanReadableSize(bytes), 15)} │ ${padRight(count, 15)} │ ${padRight(valueType, 15)} │ ${padRight(dateToString(new Date(last)), 20)} │`,
      );
      if (desc) {
        log(`│          |   ${padRight(JSON.stringify(desc), 153)} |`);
      }
      if (limits) {
        log(`│          │   ${padRight(JSON.stringify(limits), 153)} |`);
      }
    }
    log(
      "╰──────────┴─────────────────────────────────────────────────────┴───────────────────────┴──────────────────┴──────────────────┴──────────────────┴───────────────────────╯",
    );
  };
}

function dateToString(d: Date) {
  return d.toISOString().replace("T", " ").replace("Z", "").split(".")[0];
}

function padRight(s: any, n) {
  if (typeof s != "string") {
    s = `${s}`;
  }
  while (s.length <= n) {
    s += " ";
  }
  return s;
}

export const cache = refCache<Location & { noCache?: boolean }, Inventory>({
  name: "inventory",
  createObject: async (loc) => {
    const k = new Inventory(loc);
    await k.init();
    return k;
  },
});

export async function inventory(options: Location = {}): Promise<Inventory> {
  return await cache(options);
}

import { waitUntilReady } from "@cocalc/nats/tiered-storage/client";
export async function persist(location: Location) {
  waitUntilReady(location);
  const i = await inventory(location);
  await i.persist();
}
