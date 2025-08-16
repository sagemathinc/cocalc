/*
Distributed eventually consistent key:object store, where changes propogate sparsely.

The "values" MUST be objects and no keys or fields of objects can container the
sep character, which is '|' by default.

NOTE: Whenever you do a set, the lodash isEqual function is used to see which fields
you are setting are actually different, and only those get sync'd out.
This takes more resources on each client, but less on the network and servers.
It also means that if two clients write to an object at the same time but to
different field (a merge conflict), then the result gets merged together properly
with last write wins per field.

DEVELOPMENT:

~/cocalc/src/packages/backend n
   > t = await require("@cocalc/backend/conat/sync").dko({name:'test'})

*/

import { EventEmitter } from "events";
import { dkv as createDKV, DKV, DKVOptions } from "./dkv";
import { is_object } from "@cocalc/util/misc";
import refCache from "@cocalc/util/refcache";
import jsonStableStringify from "json-stable-stringify";
import { isEqual } from "lodash";

export function userKvKey(options: DKVOptions) {
  if (!options.name) {
    throw Error("name must be specified");
  }
  const { client, ...x } = options;
  return jsonStableStringify(x)!;
}

export class DKO<T = any> extends EventEmitter {
  dkv?: DKV; // can't type this

  constructor(private opts: DKVOptions) {
    super();
    this.setMaxListeners(1000);
    return new Proxy(this, {
      deleteProperty(target, prop) {
        if (typeof prop == "string") {
          target.delete(prop);
          return true;
        }
        return false;
      },
      set(target, prop, value) {
        prop = String(prop);
        if (prop == "_eventsCount" || prop == "_events" || prop == "close") {
          target[prop] = value;
          return true;
        }
        if (target[prop] != null) {
          throw Error(`method name '${prop}' is read only`);
        }
        target.set(prop, value);
        return true;
      },
      get(target, prop) {
        return target[String(prop)] ?? target.get(String(prop));
      },
    });
  }

  private dkvOnChange = ({ key: path, value }) => {
    if (path == null) {
      // TODO: could this happen?
      return;
    }
    const { key, field } = this.fromPath(path);
    if (!field) {
      // there is no field part of the path, which happens
      // only for delete of entire object, after setting all
      // the fields to null.
      this.emit("change", { key });
    } else {
      if (value === undefined && this.dkv?.get(key) == null) {
        // don't emit change setting fields to undefined if the
        // object was already deleted.
        return;
      }
      this.emit("change", { key, field, value });
    }
  };

  private dkvOnReject = ({ key: path, value }) => {
    if (path == null) {
      // TODO: would this happen?
      return;
    }
    const { key, field } = this.fromPath(path);
    if (!field) {
      this.emit("reject", { key });
    } else {
      this.emit("reject", { key, field, value });
    }
  };

  private initialized = false;
  init = async () => {
    if (this.initialized) {
      throw Error("init can only be called once");
    }
    this.initialized = true;
    this.dkv = await createDKV<{ [key: string]: any }>({
      ...this.opts,
      name: dkoPrefix(this.opts.name),
    });
    this.dkv.on("change", this.dkvOnChange);
    this.dkv.on("reject", this.dkvOnReject);
  };

  close = async () => {
    if (this.dkv == null) {
      return;
    }
    this.dkv.removeListener("change", this.dkvOnChange);
    this.dkv.removeListener("reject", this.dkvOnReject);
    await this.dkv.close();
    delete this.dkv;
    // @ts-ignore
    delete this.opts;
    this.emit("closed");
    this.removeAllListeners();
  };

  // WARNING: Do *NOT* change toPath and fromPath except in a backward incompat
  // way, since it would corrupt all user data involving this.
  private toPath = (key: string, field: string): string => {
    return JSON.stringify([key, field]);
  };

  private fromPath = (path: string): { key: string; field?: string } => {
    if (path.startsWith("[") && path.endsWith("]")) {
      // *might* be json encoded as above
      try {
        const v = JSON.parse(path);
        if (v.length == 2) {
          const [key, field] = v;
          return { key, field };
        } else {
          throw Error("fallback");
        }
      } catch {
        // it wasn't json encoded
        // see https://github.com/sagemathinc/cocalc/issues/8386
        return { key: path };
      }
    } else {
      // not encoded since no field -- the value of this one is the list of keys
      return { key: path };
    }
  };

  delete = (key: string) => {
    if (this.dkv == null) {
      throw Error("closed");
    }
    const fields = this.dkv.get(key);
    if (fields == null) {
      return;
    }
    this.dkv.delete(key);
    for (const field of fields) {
      this.dkv.delete(this.toPath(key, field));
    }
  };

  clear = () => {
    this.dkv?.clear();
  };

  get = (key: string): T | undefined => {
    if (this.dkv == null) {
      throw Error("closed");
    }
    const fields = this.dkv.get(key);
    if (fields == null) {
      return undefined;
    }
    const x: any = {};
    try {
      for (const field of fields) {
        x[field] = this.dkv.get(this.toPath(key, field));
      }
      return x;
    } catch {
      return undefined;
    }
  };

  has = (key: string): boolean => {
    if (this.dkv == null) {
      throw Error("closed");
    }
    return this.dkv.has(key);
  };

  getAll = (): { [key: string]: T } => {
    // get everything
    if (this.dkv == null) {
      throw Error("closed");
    }
    const all = this.dkv.getAll();
    const result: any = {};
    for (const x in all) {
      const { key, field } = this.fromPath(x);
      if (!field) {
        continue;
      }
      if (result[key] == null) {
        result[key] = { [field]: all[x] };
      } else {
        result[key][field] = all[x];
      }
    }
    return result;
  };

  set = (key: string, obj: T) => {
    if (this.dkv == null) {
      throw Error("closed");
    }
    if (obj == null) {
      this.delete(key);
      return;
    }
    if (!is_object(obj)) {
      throw Error("values must be objects");
    }
    const fields = Object.keys(obj);
    const cur = this.dkv.get(key);
    if (!isEqual(cur, fields)) {
      this.dkv.set(key, fields);
    }
    for (const field of fields) {
      const path = this.toPath(key, field);
      const value = obj[field];
      const cur = this.dkv.get(path);
      if (!isEqual(cur, value)) {
        this.dkv.set(path, value);
      }
    }
  };

  hasUnsavedChanges = (): boolean => {
    return !!this.dkv?.hasUnsavedChanges();
  };

  unsavedChanges = (): { key: string; field: string }[] => {
    const dkv = this.dkv;
    if (dkv == null) {
      return [];
    }
    const v = dkv.unsavedChanges();
    const w: { key: string; field: string }[] = [];
    for (const path of v) {
      const { key, field } = this.fromPath(path);
      if (field) {
        w.push({ key, field });
      }
    }
    return w;
  };

  save = async () => {
    await this.dkv?.save();
  };
}

export const cache = refCache<DKVOptions, DKO>({
  name: "dko",
  createKey: userKvKey,
  createObject: async (opts) => {
    const k = new DKO(opts);
    await k.init();
    return k;
  },
});

// WARNING: changing this or it will silently delete user data.
export const DKO_PREFIX = "__dko__";

function dkoPrefix(name: string): string {
  return `${DKO_PREFIX}${name}`;
}

export async function dko<T>(options: DKVOptions): Promise<DKO<T>> {
  return await cache(options);
}
