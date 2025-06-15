/*
Inventory of all streams and key:value stores in a specific project or account.

DEVELOPMENT:

i = await require('@cocalc/backend/conat/sync').inventory({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf'})

i.ls()

*/

import { dkv, type DKV } from "./dkv";
import { dstream, type DStream } from "./dstream";
import getTime from "@cocalc/conat/time";
import refCache from "@cocalc/util/refcache";
import type { JSONValue } from "@cocalc/util/types";
import {
  human_readable_size as humanReadableSize,
  trunc_middle,
} from "@cocalc/util/misc";
import { DKO_PREFIX } from "./dko";
import { waitUntilTimeAvailable } from "@cocalc/conat/time";
import {
  type Configuration,
  type PartialInventory,
} from "@cocalc/conat/persist/storage";
import { AsciiTable3 } from "@cocalc/ascii-table3";

export const INVENTORY_UPDATE_INTERVAL = 30000;
export const THROTTLE_MS = 10000;
export const INVENTORY_NAME = "CoCalc-Inventory";

type Sort =
  | "last"
  | "created"
  | "count"
  | "bytes"
  | "name"
  | "type"
  | "-last"
  | "-created"
  | "-count"
  | "-bytes"
  | "-name"
  | "-type";

interface Location {
  account_id?: string;
  project_id?: string;
}

type StoreType = "stream" | "kv";

export interface InventoryItem extends PartialInventory {
  // when it was created
  created: number;
  // last time this stream was updated
  last: number;
  // optional description, which can be anything
  desc?: JSONValue;
}

interface FullItem extends InventoryItem {
  type: StoreType;
  name: string;
}

export class Inventory {
  public location: Location;
  private dkv?: DKV<InventoryItem>;

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
    limits,
    seq,
  }: {
    type: StoreType;
    name: string;
    bytes: number;
    count: number;
    limits: Partial<Configuration>;
    desc?: JSONValue;
    seq: number;
  }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    const last = getTime();
    const key = this.encodeKey({ name, type });
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

  private encodeKey = ({ name, type }) => JSON.stringify({ name, type });

  private decodeKey = (key) => JSON.parse(key);

  delete = ({ name, type }: { name: string; type: StoreType }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    this.dkv.delete(this.encodeKey({ name, type }));
  };

  get = (
    x: { name: string; type: StoreType } | string,
  ): (InventoryItem & { type: StoreType; name: string }) | undefined => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    let cur;
    let name, type;
    if (typeof x == "string") {
      // just the name -- we infer/guess the type
      name = x;
      type = "kv";
      cur = this.dkv.get(this.encodeKey({ name, type }));
      if (cur == null) {
        type = "stream";
        cur = this.dkv.get(this.encodeKey({ name, type }));
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

  getStores = async ({ filter }: { filter?: string } = {}): Promise<
    (DKV | DStream)[]
  > => {
    const v: (DKV | DStream)[] = [];
    for (const x of this.getAll({ filter })) {
      const { desc, name, type } = x;
      if (type == "kv") {
        v.push(await dkv({ name, ...this.location, desc }));
      } else if (type == "stream") {
        v.push(await dstream({ name, ...this.location, desc }));
      } else {
        throw Error(`unknown store type '${type}'`);
      }
    }
    return v;
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
      const { name, type } = this.decodeKey(key);
      if (filter) {
        const { desc } = all[key];
        const s = `${desc ? JSON.stringify(desc) : ""} ${name}`.toLowerCase();
        if (!s.includes(filter)) {
          continue;
        }
      }
      v.push({ ...all[key], name, type });
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
    log(
      "ls(opts: {filter?: string; noTrunc?: boolean; path?: string; sort?: 'last'|'created'|'count'|'bytes'|'name'|'type'|'-last'|...})",
    );

    const rows: any[] = [];
    for (const key of this.sortedKeys(all, sort)) {
      const { last, created, count, bytes, desc, limits } = all[key];
      if (path0 && desc?.["path"] != path0) {
        continue;
      }
      let { name, type } = this.decodeKey(key);
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
      rows.push([
        type,
        name,
        dateToString(new Date(created)),
        humanReadableSize(bytes),
        count,
        dateToString(new Date(last)),
        desc ? JSON.stringify(desc) : "",
        Object.keys(limits).length > 0 ? JSON.stringify(limits) : "--",
      ]);
    }

    const table = new AsciiTable3(
      `Inventory for ${JSON.stringify(this.location)}`,
    )
      .setHeading(
        "Type",
        "Name",
        "Created",
        "Size",
        "Count",
        "Last Update",
        "Desc",
        "Limits",
      )
      .addRowMatrix(rows);
    table.setStyle("unicode-round");
    table.setWidth(7, 50).setWrapped(1);
    table.setWidth(8, 30).setWrapped(1);
    log(table.toString());
  };
}

function dateToString(d: Date) {
  return d.toISOString().replace("T", " ").replace("Z", "").split(".")[0];
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
