/*
Nats implementation of the idea of a "SyncTable".

This is ONLY for synctables in the scope of a single project, e.g.,
syncstrings, listings, etc.

It uses a SINGLE NATS key-value store to represent
*all* SyncTables in a single project.
*/

import { Kvm } from "@nats-io/kv";
import { sha1 } from "@cocalc/util/misc";
import jsonStableStringify from "json-stable-stringify";
import { keys } from "lodash";
import { client_db } from "@cocalc/util/db-schema/client-db";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { EventEmitter } from "events";
import { wait } from "@cocalc/util/async-wait";
import { throttle } from "lodash";

export function natsKeyPrefix({
  query,
  atomic = false,
  singleton,
}: {
  query;
  atomic?: boolean;
  singleton?: string;
}) {
  if (atomic) {
    if (singleton) {
      throw Error("not implemented");
    }
    return sha1(jsonStableStringify({ query, atomic }));
  } else {
    // for non-atomic there's no problem with many different queries with the same primary keys.
    // we thus just use the table's name
    let prefix = keys(query)[0];
    if (singleton) {
      prefix += "." + singleton;
    }
    return prefix;
  }
}

export async function getKv({
  nc,
  project_id,
  account_id,
  options,
}: {
  nc;
  project_id?: string;
  account_id?: string;
  options?;
}) {
  let name;
  if (project_id) {
    name = `project-${project_id}`;
  } else if (account_id) {
    name = `account-${account_id}`;
  } else {
    throw Error("one of account_id or project_id must be defined");
  }
  const kvm = new Kvm(nc);
  return await kvm.create(name, { compression: true, ...options });
}

export interface NatsEnv {
  nc; // nats connection
  jc; // jsoncodec
  // compute sha1 hash efficiently (set differently on backend)
  sha1?: (string) => string;
}

export function toKey(x): string | undefined {
  if (x === undefined) {
    return undefined;
  } else if (typeof x === "object") {
    return jsonStableStringify(x);
  } else {
    return `${x}`;
  }
}

function isSingletonQuery(query) {
  const table = keys(query)[0];
  const pattern = query[table][0];
  for (const key of client_db.primary_keys(table)) {
    if (pattern[key] !== null) {
      // a primary key is specified, so there can be only one match
      return true;
    }
  }
  return false;
}

export class SyncTableKV extends EventEmitter {
  private kv?;
  private nc;
  private jc;
  private sha1;
  public readonly table;
  public readonly natsKeyPrefix;
  private primaryKeys: string[];
  private primaryKeysSet: Set<string>;
  private fields: string[];
  private project_id?: string;
  private account_id?: string;
  private data: { [key: string]: any } = {};
  private state: "disconnected" | "connected" | "closed" = "disconnected";
  private updateListener?;
  private changedKeys: Set<string> = new Set();
  private specifiedByQuery: { [key: string]: any };
  private singleton?: string;

  constructor({
    query,
    env,
    account_id,
    project_id,
    throttleChanges = 100,
  }: {
    query;
    env: NatsEnv;
    account_id?: string;
    project_id?: string;
    throttleChanges?: number;
  }) {
    super();
    this.sha1 = env.sha1 ?? sha1;
    this.nc = env.nc;
    this.jc = env.jc;
    this.throttledChangeEvent = throttle(
      this.throttledChangeEvent,
      throttleChanges,
      { leading: false, trailing: true },
    );
    const table = keys(query)[0];
    this.table = table;
    this.primaryKeys = client_db.primary_keys(table);
    this.primaryKeysSet = new Set(this.primaryKeys);
    this.project_id = project_id ?? query[table][0].project_id;
    this.account_id = account_id ?? query[table][0].account_id;
    this.singleton = isSingletonQuery(query)
      ? this.natObjectKey(query[table][0])
      : undefined;
    this.natsKeyPrefix = natsKeyPrefix({
      query,
      atomic: false,
      singleton: this.singleton,
    });
    this.specifiedByQuery = {};
    for (const k in query[table][0]) {
      const v = query[table][0][k];
      if (v != null) {
        this.specifiedByQuery[k] = v;
      }
    }
    this.fields = keys(query[table][0]).filter(
      (field) => !this.primaryKeysSet.has(field),
    );
    this.readData();
  }

  init = async () => {
    await this.readData();
  };

  get = (obj?) => {
    if (this.state != "connected") {
      throw Error("must be connected");
    }
    if (obj == null) {
      const result: any = {};
      for (const k in this.data) {
        result[this.primaryString(this.data[k])] = this.data[k];
      }
      return result;
    }
    return this.data[this.getKey(obj)];
  };

  get_one = () => {
    for (const key in this.data) {
      return this.data[key];
    }
  };

  set = (obj) => {
    obj = this.fillInFromQuery(obj);
    const key = this.getKey(obj);
    this.data[key] = { ...this.data[key], ...obj };
    this.setToKv(obj);
  };

  delete = (obj) => {
    const key = this.getKey(obj);
    delete this.data[key];
    this.deleteFromKv(obj);
  };

  close = () => {
    this.state = "closed";
    this.emit(this.state);
    this.updateListener?.close();
    this.data = {};
  };

  get_state = () => {
    return this.state;
  };

  public async wait(until: Function, timeout: number = 30): Promise<any> {
    if (this.state == "closed") {
      throw Error("wait: must not be closed");
    }
    return await wait({
      obj: this,
      until,
      timeout,
      change_event: "change-no-throttle",
    });
  }

  private getKv = reuseInFlight(async () => {
    if (this.kv == null) {
      this.kv = await getKv({
        nc: this.nc,
        project_id: this.project_id,
        account_id: this.account_id,
      });
    }
    return this.kv!;
  });

  // load initial data
  private readData = reuseInFlight(async () => {
    this.data = await this.getFromKv();
    this.state = "connected";
    this.emit(this.state);
    this.listenForUpdates();
  });

  private listenForUpdates = async () => {
    const kv = await this.getKv();
    this.updateListener = await kv.watch({
      key: `${this.natsKeyPrefix}.>`,
    });
    for await (const { key, value, update } of this.updateListener) {
      const i = key.lastIndexOf(".");
      const field = key.slice(i + 1);
      const prefix = key.slice(0, i);
      if (this.data[prefix] == null && value.length > 0) {
        this.data[prefix] = {};
      }
      const s = this.data[prefix];
      if (update && s != null) {
        const k = this.primaryString(s);
        this.emit("change-no-throttle", [k]);
        this.changedKeys.add(k);
        this.throttledChangeEvent();
      }
      if (s != null) {
        if (value.length == 0 && this.primaryKeysSet.has(field)) {
          delete this.data[prefix];
        } else {
          s[field] = this.jc.decode(value);
          if (Object.keys(s).length == 0) {
            delete this.data[prefix];
          }
        }
      }
    }
  };

  // this is throttled in constructor
  private throttledChangeEvent = () => {
    if (this.changedKeys.size > 0) {
      this.emit("change", Array.from(this.changedKeys));
      this.changedKeys.clear();
    }
  };

  private fillInFromQuery = (obj) => {
    return { ...obj, ...this.specifiedByQuery };
  };

  private primaryString = (obj): string => {
    if (this.primaryKeys.length === 1) {
      const k = obj[this.primaryKeys[0]];
      if (k == null) {
        console.log({ obj });
        throw Error(`primary key '${this.primaryKeys[0]}' not set for object`);
      }
      return toKey(k)!;
    } else {
      // compound primary key
      return toKey(
        this.primaryKeys.map((pk) => {
          const v = obj[pk];
          if (v == null) {
            console.log({ obj });
            throw Error(
              `part of compound primary key '${pk}' not set for object`,
            );
          }
          return v;
        }),
      )!;
    }
  };

  private natObjectKey = (obj): string => {
    if (obj == null) {
      throw Error("obj must be an object (not null)");
    }
    return this.sha1(this.primaryString(this.fillInFromQuery(obj)));
  };

  private getKey = (obj, field?: string): string => {
    const x = this.singleton
      ? this.natsKeyPrefix
      : `${this.natsKeyPrefix}.${this.natObjectKey(obj)}`;
    if (field == null) {
      return x;
    } else {
      return `${x}.${field}`;
    }
  };

  private setToKv = async (obj) => {
    const kv = await this.getKv();
    const key = this.getKey(obj);
    for (const field in obj) {
      const value = this.jc.encode(obj[field]);
      await kv.put(`${key}.${field}`, value);
    }
  };

  private deleteFromKv = async (obj) => {
    const kv = await this.getKv();
    const key = this.getKey(obj);
    const keys = await kv.keys(`${key}.>`);
    for await (const k of keys) {
      await kv.delete(k);
    }
    await kv.delete(key);
  };

  getFromKv = async (obj?, field?) => {
    const kv = await this.getKv();
    if (obj == null) {
      // everything known in this table by the project
      const keys = await kv.keys(`${this.natsKeyPrefix}.>`);
      const all: any = {};
      for await (const key of keys) {
        const mesg = await kv.get(key);
        const val = mesg?.sm?.data ? this.jc.decode(mesg.sm.data) : null;
        if (val != null) {
          const i = key.lastIndexOf(".");
          const field = key.slice(i + 1);
          const prefix = key.slice(0, i);
          if (all[prefix] == null) {
            all[prefix] = {};
          }
          const s = all[prefix];
          s[field] = val;
        }
      }
      return all;
    }
    if (field == null) {
      const s = { ...obj };
      const key = this.getKey(obj);
      let nontrivial = false;
      // todo: possibly better to just ask for everything under ${key}.>
      // and take what is needed?  Not sure.
      for (const field of this.fields) {
        const mesg = await kv.get(`${key}.${field}`);
        const val = mesg?.sm?.data ? this.jc.decode(mesg.sm.data) : null;
        if (val != null) {
          s[field] = val;
          nontrivial = true;
        }
      }
      return nontrivial ? s : undefined;
    }
    const mesg = await kv.get(this.getKey(obj, field));
    if (mesg == null) {
      return undefined;
    }
    return this.jc.decode(mesg.sm.data);
  };

  // watch for changes in ONE object
  async *watchOne(obj) {
    const kv = await this.getKv();
    const w = await kv.watch({
      key: this.getKey(this.getKey(obj), "*"),
    });
    for await (const { key, value } of w) {
      const field = key.slice(key.lastIndexOf(".") + 1);
      yield { [field]: this.jc.decode(value) };
    }
  }
}
