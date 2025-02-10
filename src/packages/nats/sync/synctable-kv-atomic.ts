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

export class SyncTableKVAtomic extends EventEmitter {
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

  constructor({
    query,
    env,
    account_id,
    project_id,
    atomic,
    immutable,
  }: {
    query;
    env: NatsEnv;
    account_id?: string;
    project_id?: string;
    atomic?: boolean;
    immutable?: boolean;
  }) {
    super();
    this.atomic = !!atomic;
    this.getHook = immutable ? fromJS : (x) => x;
    this.query = query;
    this.env = env;
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

  private getName = () => {
    const primary: any = {};
    const spec = this.query[this.table][0];
    for (const key of this.primaryKeys) {
      const val = spec[key];
      if (val != null) {
        primary[key] = val;
      }
    }
    if (Object.keys(primary).length == 0) {
      return this.table;
    } else {
      return `${this.table}-${jsonStableStringify(primary)}`;
    }
  };

  init = async () => {
    const name = this.getName();
    if (this.atomic) {
      this.dkv = await createDkv({
        name,
        account_id: this.account_id,
        project_id: this.project_id,
        env: this.env,
      });
    } else {
      this.dkv = await createDko({
        name,
        account_id: this.account_id,
        project_id: this.project_id,
        env: this.env,
      });
    }
    this.dkv.on("change", (x) => {
      if (!this.atomic) {
        x = { ...x, value: this.dkv?.get(x.key) };
      }
      this.emit("change", x);
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
      return this.getHook(this.dkv.get());
    }
    return this.getHook(this.dkv.get(this.getKey(obj_or_key)));
  };

  get_one = () => {
    if (this.dkv == null) throw Error("closed");
    // TODO: insanely inefficient, especially if !atomic!
    for (const key in this.dkv.get()) {
      return this.get(key);
    }
  };

  save = async () => {
    await this.dkv?.save();
  };

  close = () => {
    if (this.state == "closed") return;
    this.set_state("closed");
    this.removeAllListeners();
    this.dkv?.close();
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
