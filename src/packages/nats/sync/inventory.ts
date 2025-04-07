/*
Inventory of all streams and key:value stores in a specific project, account or the public space.

DEVELOPMENT:

i = await require('@cocalc/backend/nats/sync').inventory({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf'})

i.ls()

*/

import { dkv, type DKV } from "./dkv";
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

export const THROTTLE_MS = 5000;
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
    valueType: ValueType;
  }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    this.dkv.delete(this.encodeKey({ name, type, valueType }));
  };

  get = (
    x: { name: string; type: StoreType; valueType?: ValueType } | string,
  ): Item & { type: StoreType; name: string } => {
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
      throw Error(`no ${type} named ${name}`);
    }
    return { ...cur, type, name };
  };

  getStore = async (
    x: { name: string; type: StoreType; valueType?: ValueType } | string,
  ): Promise<DKV | DStream> => {
    const cur = this.get(x);
    const { desc, name, type } = cur;
    if (type == "kv") {
      return await dkv({ name, ...this.location, desc });
    } else if (type == "stream") {
      return await dstream({ name, ...this.location, desc });
    } else {
      throw Error(`unknown store type '${type}'`);
    }
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

  getAll = () => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    return this.dkv.getAll();
  };

  close = () => {
    this.dkv?.close();
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
    notrunc,
    path: path0,
    sort = "-last",
  }: {
    log?: Function;
    filter?: string;
    notrunc?: boolean;
    path?: string;
    sort?: Sort;
  } = {}) => {
    const all = this.getAll();
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
      if (!notrunc) {
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
  createObject: async (loc) => {
    const k = new Inventory(loc);
    await k.init();
    return k;
  },
});

export async function inventory(options: Location = {}): Promise<Inventory> {
  return await cache(options);
}
