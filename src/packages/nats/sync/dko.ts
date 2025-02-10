/*
Distributed eventually consistent key:object store, where changes propogate sparsely.

The "values" MUST be objects and no keys or fields of objects can container the sep character,
which is '|' by default.

DEVELOPMENT:

~/cocalc/src/packages/backend n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> t = await require("@cocalc/backend/nats/sync").dko({name:'test'})

*/

import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { dkv as createDKV, DKV, DKVOptions } from "./dkv";
import { userKvKey } from "./kv";
import { is_object } from "@cocalc/util/misc";

export interface DKOOptions extends DKVOptions {
  sep?: string;
}

export class DKO extends EventEmitter {
  opts: DKOOptions;
  sep: string;
  dkv?: DKV;

  constructor(opts: DKOOptions) {
    super();
    this.opts = opts;
    this.sep = opts.sep ?? "|";
    this.init();
    return new Proxy(this, {
      deleteProperty(target, prop) {
        target.delete(prop);
        return true;
      },
      set(target, prop, value) {
        prop = String(prop);
        if (prop == "_eventsCount") {
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

  init = reuseInFlight(async () => {
    if (this.dkv != null) {
      throw Error("already initialized");
    }
    this.dkv = await createDKV({
      ...this.opts,
      name: dkoPrefix(this.opts.name),
    });
    this.dkv.on("change", ({ key: path, value }) => {
      const { key, field } = this.fromPath(path);
      if (!field) {
        this.emit("change", { key });
      } else {
        this.emit("change", { key, field, value });
      }
    });
    this.dkv.on("reject", ({ key: path, value }) => {
      const { key, field } = this.fromPath(path);
      if (!field) {
        this.emit("reject", { key });
      } else {
        this.emit("reject", { key, field, value });
      }
    });
    await this.dkv.init();
  });

  close = () => {
    if (this.dkv == null) {
      return;
    }
    this.dkv.close();
    delete this.dkv;
    this.emit("closed");
    this.removeAllListeners();
  };

  private toPath = (key: string, field: string): string => {
    return `${key}${this.sep}${field}`;
  };

  private fromPath = (path: string): { key: string; field: string } => {
    const [key, field] = path.split(this.sep);
    return { key, field };
  };

  delete = (key) => {
    if (this.dkv == null) {
      throw Error("closed");
    }
    const fields = this.dkv.get(key);
    if (fields == null) {
      return;
    }
    for (const field of fields) {
      this.dkv.delete(this.toPath(key, field));
    }
  };

  get = (key?) => {
    if (this.dkv == null) {
      throw Error("closed");
    }
    if (key == null) {
      // get everything
      const all = this.dkv.get();
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
    } else {
      const fields = this.dkv.get(key);
      if (fields == null) {
        return undefined;
      }
      const x: any = {};
      for (const field of fields) {
        x[field] = this.dkv.get(this.toPath(key, field));
      }
      return x;
    }
  };

  set = (key: string, obj: any) => {
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
    this.dkv.set(key, fields);
    for (const field of fields) {
      this.dkv.set(this.toPath(key, field), obj[field]);
    }
  };

  hasUnsavedChanges = () => {
    return !!this.dkv?.hasUnsavedChanges();
  };

  unsavedChanges = () => {
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

const cache: { [key: string]: DKO } = {};
export const dko = reuseInFlight(
  async (opts: DKOOptions) => {
    const key = userKvKey(opts);
    if (cache[key] == null) {
      const k = new DKO(opts);
      await k.init();
      k.on("closed", () => delete cache[key]);
      cache[key] = k;
    }
    return cache[key]!;
  },
  {
    createKey: (args) => userKvKey(args[0]),
  },
);

function dkoPrefix(name: string): string {
  return `__dko__${name}`;
}
