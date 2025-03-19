/*
Inventory of all streams and key:value stores in a specific project, account or the public space.


*/

import { dkv, type DKV } from "./dkv";
import { dstream } from "./dstream";
import getTime from "@cocalc/nats/time";
import refCache from "@cocalc/util/refcache";
import type { JSONValue } from "@cocalc/util/types";
import { human_readable_size as humanReadableSize } from "@cocalc/util/misc";
import type { ValueType } from "./kv";

export const THROTTLE_MS = 5000;
export const INVENTORY_NAME = "CoCalc-Inventory";

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

  set = ({
    type,
    name,
    bytes,
    count,
    desc,
    valueType,
  }: {
    type: StoreType;
    name: string;
    bytes: number;
    count: number;
    desc?: JSONValue;
    valueType?: ValueType;
  }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    const last = getTime();
    const cur = this.dkv.get(this._key({ name, type }));
    const created = cur?.created ?? last;
    desc = desc ?? cur?.desc;
    this.dkv.set(this._key({ name, type }), {
      desc,
      last,
      created,
      bytes,
      count,
      valueType,
    });
  };

  private _key = ({ name, type }) => `${name}-${type}`;

  delete = ({ name, type }: { name: string; type: StoreType }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    this.dkv.delete(this._key({ name, type }));
  };

  // Get but with NO LIMITS and no MERGE conflict algorithm. Use with care!
  get = async (x: { name: string; type: StoreType } | string) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    let cur;
    let name, type;
    if (typeof x == "string") {
      // just the name -- we infer the type
      name = x;
      type = "kv";
      cur = this.dkv.get(this._key({ name, type }));
      if (cur == null) {
        type = "stream";
        cur = this.dkv.get(this._key({ name, type }));
      }
    } else {
      ({ name, type } = x);
      cur = this.dkv.get(this._key({ name, type }));
    }
    if (cur == null) {
      throw Error(`no ${type} named ${name}`);
    }
    if (type == "kv") {
      return await dkv({ name, ...this.location, desc: cur.desc });
    } else if (type == "stream") {
      return await dstream({ name, ...this.location, desc: cur.desc });
    } else {
      throw Error(`unknown type '${type}'`);
    }
  };

  needsUpdate = ({
    name,
    type,
  }: {
    name: string;
    type: StoreType;
  }): boolean => {
    if (this.dkv == null) {
      return false;
    }
    const cur = this.dkv.get(this._key({ name, type }));
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

  ls = ({ log = console.log }: { log?: Function } = {}) => {
    const all = this.getAll();
    log(
      "╭────────┬─────────────────────────────────────────────────────┬───────────────────────┬──────────────────┬──────────────────┬──────────────────┬───────────────────────╮",
    );
    log(
      `│ ${padRight("Type", 5)} │ ${padRight("Name", 50)} │ ${padRight("Created", 20)} │ ${padRight("Size", 15)} │ ${padRight("Count", 15)} │ ${padRight("Value Type", 15)} │ ${padRight("Last Update", 20)} │`,
    );
    log(
      "├────────┼─────────────────────────────────────────────────────┼───────────────────────┼──────────────────┼──────────────────┼──────────────────┼───────────────────────┤",
    );
    for (const name_type in all) {
      const {
        last,
        created,
        count,
        bytes,
        desc,
        valueType = "json",
      } = all[name_type];
      let i = name_type.lastIndexOf("-");
      const name = i == -1 ? name_type : name_type.slice(0, i);
      const type = i == -1 ? "-" : name_type.slice(i + 1);
      log(
        `│ ${padRight(type ?? "-", 5)} │ ${padRight(name, 50)} │ ${padRight(dateToString(new Date(created)), 20)} │ ${padRight(humanReadableSize(bytes), 15)} │ ${padRight(count, 15)} │ ${padRight(valueType, 15)} │ ${padRight(dateToString(new Date(last)), 20)} │`,
      );
      if (desc) {
        log(`│        │   ${JSON.stringify(desc)}`);
      }
    }
    log(
      "╰────────┴─────────────────────────────────────────────────────┴───────────────────────┴──────────────────┴──────────────────┴──────────────────┴───────────────────────╯",
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
