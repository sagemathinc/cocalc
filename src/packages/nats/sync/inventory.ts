/*
Inventory of all streams and key:value stores in a specific project, account or the public space.


*/

import { dkv, type DKV } from "./dkv";
import getTime from "@cocalc/nats/time";
import refCache from "@cocalc/util/refcache";
import type { JSONValue } from "@cocalc/util/types";

export const THROTTLE_MS = 5000;

interface Location {
  account_id?: string;
  project_id?: string;
}

interface KVInfo {
  // when it was created
  created: number;
  // last time this kv-store was updated
  last: number;
  // how much space is used by this kv-store
  bytes: number;
  // number of keys
  keys: number;
  // optional description, which can be anything
  desc?: JSONValue;
}

export class InventoryOfKVs {
  public location: Location;
  private dkv?: DKV<KVInfo>;

  constructor(location: { account_id?: string; project_id?: string }) {
    this.location = location;
  }

  init = async () => {
    this.dkv = await dkv({
      name: "kv-inventory",
      ...this.location,
    });
  };

  set = ({
    name,
    bytes,
    keys,
    desc,
  }: {
    name: string;
    bytes: number;
    keys: number;
    desc?: JSONValue;
  }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    const last = getTime();
    const cur = this.dkv.get(name);
    const created = cur?.created ?? last;
    desc = desc ?? cur?.desc;
    this.dkv.set(name, { desc, last, created, bytes, keys });
  };

  delete = (name: string) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    this.dkv.delete(name);
  };

  get = (name: string) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    return this.dkv.get(name);
  };

  needsUpdate = (name: string): boolean => {
    const cur = this.get(name);
    if (cur == null) {
      return true;
    }
    if (getTime() - cur.last >= 0.9 * THROTTLE_MS) {
      return true;
    }
    return false;
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

  ls = () => {
    const all = this.getAll();
    console.log(
      "╭──────────────────────────────┬───────────────────────┬──────────────────┬──────────────────┬───────────────────────╮",
    );
    console.log(
      `│ ${padRight("Name", 27)} │ ${padRight("Created", 20)} │ ${padRight("Bytes", 15)} │ ${padRight("Values", 15)} │ ${padRight("Last Update", 20)} │`,
    );
    console.log(
      "├──────────────────────────────┼───────────────────────┼──────────────────┼──────────────────┼───────────────────────┤",
    );
    for (const name in all) {
      const { last, created, keys, bytes, desc } = all[name];
      console.log(
        `│ ${padRight(name, 27)} │ ${padRight(dateToString(new Date(created)), 20)} │ ${padRight(bytes, 15)} │ ${padRight(keys, 15)} │ ${padRight(dateToString(new Date(last)), 20)} │`,
      );
      if (desc) {
        console.log(`│${JSON.stringify(desc)}`);
      }
    }
    console.log(
      "╰──────────────────────────────┴───────────────────────┴──────────────────┴──────────────────┴───────────────────────╯",
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

export const cacheKv = refCache<
  Location & { noCache?: boolean },
  InventoryOfKVs
>({
  createObject: async (loc) => {
    const k = new InventoryOfKVs(loc);
    await k.init();
    return k;
  },
});

export async function kvInventory(options: Location): Promise<InventoryOfKVs> {
  return await cacheKv(options);
}

interface StreamInfo {
  // when it was created
  created: number;
  // last time this stream was updated
  last: number;
  // how much space is used by this stream
  bytes: number;
  // number of messages
  messages: number;
  desc?: JSONValue;
}

export class InventoryOfStreams {
  public location: Location;
  private dkv?: DKV<StreamInfo>;

  constructor(location: Location) {
    this.location = location;
  }

  init = async () => {
    this.dkv = await dkv({ name: "stream-inventory", ...this.location });
  };

  set = ({
    name,
    bytes,
    messages,
    desc,
  }: {
    name: string;
    bytes: number;
    messages: number;
    desc?: JSONValue;
  }) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    const last = getTime();
    const cur = this.dkv.get(name);
    const created = cur?.created ?? last;
    desc = desc ?? cur?.desc;
    this.dkv.set(name, { desc, last, created, bytes, messages });
  };

  delete = (name: string) => {
    if (this.dkv == null) {
      throw Error("not initialized");
    }
    this.dkv.delete(name);
  };

  get = (name: string) => {
    if (this.dkv == null) throw Error("not initialized");
    return this.dkv.get(name);
  };

  needsUpdate = (name: string): boolean => {
    const cur = this.get(name);
    if (cur == null) {
      return true;
    }
    if (getTime() - cur.last >= 0.9 * THROTTLE_MS) {
      return true;
    }
    return false;
  };

  getAll = () => {
    if (this.dkv == null) throw Error("not initialized");
    return this.dkv.getAll();
    console.log("getAll");
  };

  close = () => {
    this.dkv?.close();
  };

  ls = () => {
    const all = this.getAll();
    console.log(
      "╭─────────────────────────────────────────────────────┬───────────────────────┬──────────────────┬──────────────────┬───────────────────────╮",
    );
    console.log(
      `│ ${padRight("Name", 50)} │ ${padRight("Created", 20)} │ ${padRight("Bytes", 15)} │ ${padRight("Messages", 15)} │ ${padRight("Last Update", 20)} │`,
    );
    console.log(
      "├─────────────────────────────────────────────────────┼───────────────────────┼──────────────────┼──────────────────┼───────────────────────┤",
    );
    for (const name in all) {
      const { last, created, messages, bytes, desc } = all[name];
      console.log(
        `│ ${padRight(name, 50)} │ ${padRight(dateToString(new Date(created)), 20)} │ ${padRight(bytes, 15)} │ ${padRight(messages, 15)} │ ${padRight(dateToString(new Date(last)), 20)} │`,
      );
      if (desc) {
        console.log(`│   ${JSON.stringify(desc)}`);
      }
    }
    console.log(
      "╰─────────────────────────────────────────────────────┴───────────────────────┴──────────────────┴──────────────────┴───────────────────────╯",
    );
  };
}

export const cacheStream = refCache<
  Location & { noCache?: boolean },
  InventoryOfStreams
>({
  createObject: async (loc) => {
    const k = new InventoryOfStreams(loc);
    await k.init();
    return k;
  },
});

export async function streamInventory(
  options: Location,
): Promise<InventoryOfStreams> {
  return await cacheStream(options);
}
