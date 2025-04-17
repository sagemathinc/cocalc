/*




*/

import { keys } from "lodash";
import { client_db } from "@cocalc/util/db-schema/client-db";
import type { NatsEnv, State } from "@cocalc/nats/types";
import { EventEmitter } from "events";
import { dkv as createDkv, type DKV } from "./dkv";
import { dko as createDko, type DKO } from "./dko";
import jsonStableStringify from "json-stable-stringify";
import { toKey } from "@cocalc/nats/util";
import { wait } from "@cocalc/util/async-wait";
import { fromJS, Map } from "immutable";
import { type KVLimits } from "./general-kv";
import type { JSONValue } from "@cocalc/util/types";

export class SyncTableKV extends EventEmitter {
  public readonly table;
  private query;
  private atomic: boolean;
  private primaryKeys: string[];
  private project_id?: string;
  private account_id?: string;
  private state: State = "disconnected";
  private dkv?: DKV | DKO;
  private env;
  private getHook: Function;
  private limits?: Partial<KVLimits>;
  private desc?: JSONValue;
  private noInventory?: boolean;

  constructor({
    query,
    env,
    account_id,
    project_id,
    atomic,
    immutable,
    limits,
    desc,
    noInventory,
  }: {
    query;
    env: NatsEnv;
    account_id?: string;
    project_id?: string;
    atomic?: boolean;
    immutable?: boolean;
    limits?: Partial<KVLimits>;
    desc?: JSONValue;
    noInventory?: boolean;
  }) {
    super();
    this.noInventory = noInventory;
    this.setMaxListeners(100);
    this.atomic = !!atomic;
    this.getHook = immutable ? fromJS : (x) => x;
    this.query = query;
    this.limits = limits;
    this.env = env;
    this.desc = desc;
    this.table = keys(query)[0];
    if (query[this.table][0].string_id && query[this.table][0].project_id) {
      this.project_id = query[this.table][0].project_id;
    } else {
      this.account_id = account_id ?? query[this.table][0].account_id;
      this.project_id = project_id;
    }
    this.primaryKeys = client_db.primary_keys(this.table);
  }

  private set_state = (state: State): void => {
    this.state = state;
    this.emit(state);
  };

  get_state = () => {
    return this.state;
  };

  // WARNING: be *VERY* careful before changing how the name is
  // derived from the query, since if you change this all the current
  // data in NATS that caches the changefeeds is basically lost
  // and users MUST refresh their browsers (and maybe projects restart?)
  // to get new changefeeds, since they are watching something given
  // by this name.  I.e., this name shouldn't ever be changed.
  // The point of the name is that it uniquely identifies the
  // changefeed query, so just using the query itself should be fine.
  // A big choice here is the full name or just something short like the
  // sha1 hash, but I've chosen the full name, since then it is always easy
  // to know what the query was, i.e., use base64 decoding then you
  // have the query.  It's less efficient though since the NATS subjects
  // can be long, depending on the query.
  // This way if we are just watching general NATS traffic and see something
  // suspicious, even if we have no idea initially where it came from,
  // we can easily see by decoding it.
  // Including even the fields with no values distinguishes different
  // changefeeds that pick off different columns from the database.
  // PLAN: Longterm there's no doubt that changefeeds in postgresql will
  // be eliminated from cocalc completely, and at that point situation
  // will melt away.
  private getName = () => {
    const spec = this.query[this.table][0];
    if (spec.string_id) {
      // special case -- the tables with a string_id never touch the database
      // and are used with *different* spec at the same time to coordinate
      // between browser and project, so we can't use the spec.
      return `${this.table}:${spec.string_id}`;
    }
    return `${this.table}:${jsonStableStringify(spec)}`;
  };

  init = async () => {
    const name = this.getName();
    if (this.atomic) {
      this.dkv = await createDkv({
        name,
        account_id: this.account_id,
        project_id: this.project_id,
        env: this.env,
        limits: this.limits,
        desc: this.desc,
        noInventory: this.noInventory,
      });
    } else {
      this.dkv = await createDko({
        name,
        account_id: this.account_id,
        project_id: this.project_id,
        env: this.env,
        limits: this.limits,
        desc: this.desc,
        noInventory: this.noInventory,
      });
    }
    // For some reason this one line confuses typescript and break building the compute server package (nothing else similar happens).
    // Do not remove.  The error is that "this.dkv.on" is not callable.
    // @ts-ignore
    this.dkv.on("change", (x) => {
      if (!this.atomic) {
        if (x.value === undefined) {
          // delete
          x = { ...x, prev: this.dkv?.get(x.key) };
        } else {
          // change
          x = { ...x, value: this.dkv?.get(x.key) };
        }
      }
      // change api was to emit array of keys.
      // We also use this packages/sync/table/changefeed-nats.ts which needs the value,
      // so we emit that object second.
      this.emit("change", [x.key], x);
    });
    this.set_state("connected");
  };

  getKey = (obj_or_key): string => {
    if (typeof obj_or_key == "string") {
      return obj_or_key;
    }
    let obj = obj_or_key;
    if (Map.isMap(obj)) {
      obj = obj.toJS();
    }
    if (this.primaryKeys.length === 1) {
      return toKey(obj[this.primaryKeys[0]] ?? "")!;
    } else {
      // compound primary key
      return toKey(this.primaryKeys.map((pk) => obj[pk]))!;
    }
  };

  set = (obj) => {
    if (this.dkv == null) throw Error("closed");
    if (Map.isMap(obj)) {
      obj = obj.toJS();
    }
    this.dkv.set(this.getKey(obj), obj);
  };

  delete = (obj_or_key) => {
    if (this.dkv == null) throw Error("closed");
    this.dkv.delete(this.getKey(obj_or_key));
  };

  get = (obj_or_key?) => {
    if (this.dkv == null) throw Error("closed");
    if (obj_or_key == null) {
      return this.getHook(this.dkv.getAll());
    }
    return this.getHook(this.dkv.get(this.getKey(obj_or_key)));
  };

  get_one = () => {
    if (this.dkv == null) throw Error("closed");
    // TODO: insanely inefficient, especially if !atomic!
    for (const key in this.dkv.getAll()) {
      return this.get(key);
    }
  };

  save = async () => {
    await this.dkv?.save();
  };

  close = async () => {
    if (this.state == "closed") return;
    this.set_state("closed");
    this.removeAllListeners();
    await this.dkv?.close();
    delete this.dkv;
    // @ts-ignore
    delete this.env;
  };

  public async wait(until: Function, timeout: number = 30): Promise<any> {
    if (this.state == "closed") {
      throw Error("wait: must not be closed");
    }
    return await wait({
      obj: this,
      until,
      timeout,
      change_event: "change",
    });
  }
}
