/*




*/

import { keys } from "lodash";
import { client_db } from "@cocalc/util/db-schema/client-db";
import type { NatsEnv, State } from "@cocalc/nats/types";
import { EventEmitter } from "events";
import { dkv as createDkv, type DKV } from "./dkv";
import jsonStableStringify from "json-stable-stringify";
import { toKey } from "@cocalc/nats/util";

export class SyncTableKVAtomic extends EventEmitter {
  public readonly table;
  private query;
  private primaryKeys: string[];
  private project_id?: string;
  private account_id?: string;
  private state: State = "disconnected";
  private dkv?: DKV;
  private env;

  constructor({
    query,
    env,
    account_id,
    project_id,
  }: {
    query;
    env: NatsEnv;
    account_id?: string;
    project_id?: string;
  }) {
    super();
    this.query = query;
    this.env = env;
    this.table = keys(query)[0];
    this.account_id = account_id ?? query[this.table][0].account_id;
    this.project_id = project_id;
    this.primaryKeys = client_db.primary_keys(this.table);
  }

  private set_state = (state: State): void => {
    this.state = state;
    this.emit(state);
  };

  get_state = () => {
    return this.state;
  };

  init = async () => {
    this.dkv = await createDkv({
      name: jsonStableStringify(this.query),
      account_id: this.account_id,
      project_id: this.project_id,
      env: this.env,
    });
    this.dkv.on("change", (x) => {
      this.emit("change", x);
    });
    this.set_state("connected");
  };

  getKey = (obj_or_key): string => {
    if (typeof obj_or_key == "string") {
      return obj_or_key;
    }
    const obj = obj_or_key;
    if (this.primaryKeys.length === 1) {
      return toKey(obj[this.primaryKeys[0]] ?? "")!;
    } else {
      // compound primary key
      return toKey(this.primaryKeys.map((pk) => obj[pk]))!;
    }
  };

  set = (obj) => {
    if (this.dkv == null) throw Error("closed");
    this.dkv.set(this.getKey(obj), obj);
  };

  delete = (obj_or_key) => {
    if (this.dkv == null) throw Error("closed");
    this.dkv.delete(this.getKey(obj_or_key));
  };

  get = (obj_or_key?) => {
    if (this.dkv == null) throw Error("closed");
    if (obj_or_key == null) {
      return this.dkv.get();
    }
    return this.dkv.get(this.getKey(obj_or_key));
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
}
