/*
Nats implementation of the idea of a "SyncTable", but
for streaming data.

This is ONLY for the scope of patches in a single project.

It uses a NATS stream to store the elements in a well defined order.
*/

import jsonStableStringify from "json-stable-stringify";
import { keys } from "lodash";
import { cmp_Date, is_array, isValidUUID, sha1 } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/db-schema/client-db";
import { EventEmitter } from "events";
import { type NatsEnv } from "@cocalc/nats/types";
import { dstream, DStream } from "./dstream";
import { fromJS, Map } from "immutable";
import { type FilteredStreamLimitOptions } from "./stream";

export type State = "disconnected" | "connected" | "closed";

function toKey(x): string | undefined {
  if (x === undefined) {
    return undefined;
  } else if (typeof x === "object") {
    return jsonStableStringify(x);
  } else {
    return `${x}`;
  }
}

export class SyncTableStream extends EventEmitter {
  public readonly table;
  private primaryKeys: string[];
  private project_id?: string;
  private path: string;
  private string_id: string;
  private data: any = {};
  private state: State = "disconnected";
  private env;
  private dstream?: DStream;
  private getHook: Function;
  private limits?: Partial<FilteredStreamLimitOptions>;

  constructor({
    query,
    env,
    account_id: _account_id,
    project_id,
    immutable,
    limits,
  }: {
    query;
    env: NatsEnv;
    account_id?: string;
    project_id?: string;
    immutable?: boolean;
    limits?: Partial<FilteredStreamLimitOptions>;
  }) {
    super();
    this.setMaxListeners(100);
    this.getHook = immutable ? fromJS : (x) => x;
    this.env = env;
    this.limits = limits;
    const table = keys(query)[0];
    this.table = table;
    if (table != "patches") {
      throw Error("only the patches table is supported");
    }
    this.project_id = project_id ?? query[table][0].project_id;
    if (!isValidUUID(this.project_id)) {
      throw Error("query MUST specify a valid project_id");
    }
    this.path = query[table][0].path;
    if (!this.path) {
      throw Error("path MUST be specified");
    }
    query[table][0].string_id = this.string_id = (env.sha1 ?? sha1)(
      `${this.project_id}${this.path}`,
    );
    this.primaryKeys = client_db.primary_keys(table);
  }

  init = async () => {
    const name = `patches:${this.string_id}`;
    this.dstream = await dstream({
      name,
      project_id: this.project_id,
      env: this.env,
      limits: this.limits,
      desc: { path: this.path },
    });
    this.dstream.on("change", (mesg) => {
      this.handle(mesg, true);
    });
    this.dstream.on("reject", (err) => {
      console.warn("synctable-stream: REJECTED - ", err);
    });
    for (const mesg of this.dstream.getAll()) {
      this.handle(mesg, false);
    }
    this.setState("connected");
  };

  private setState = (state: State): void => {
    this.state = state;
    this.emit(state);
  };

  get_state = () => {
    return this.state;
  };

  private primaryString = (obj): string => {
    const obj2 = { ...obj, string_id: this.string_id };
    return toKey(this.primaryKeys.map((pk) => obj2[pk]))!;
  };

  getKey = this.primaryString;

  set = (obj) => {
    if (Map.isMap(obj)) {
      obj = obj.toJS();
    }
    // console.log("set", obj);
    // delete string_id since it is redundant info
    const key = this.primaryString(obj);
    const { string_id, ...obj2 } = obj;
    if (this.data[key] != null) {
      // "You can not change a message once committed to a stream"
      // https://github.com/nats-io/nats-server/discussions/4883
      throw Error(
        `object with key ${key} was already written to the stream -- written data cannot be modified`,
      );
      return;
    }
    // console.log("set - publish", obj);
    if (this.dstream == null) {
      throw Error("closed");
    }
    this.dstream.push(obj2);
  };

  private handle = (obj, changeEvent: boolean) => {
    if (this.state == "closed") {
      return true;
    }
    const key = this.primaryString(obj);
    this.data[key] = { ...obj, time: new Date(obj.time) };
    if (this.data[key].prev != null) {
      this.data[key].prev = new Date(this.data[key].prev);
    }
    if (changeEvent) {
      this.emit("change", [key]);
    }
  };

  get = (obj?) => {
    if (obj == null) {
      return this.getHook(this.data);
    }
    if (typeof obj == "string") {
      return this.getHook(this.data[obj]);
    }
    if (is_array(obj)) {
      const x: any = {};
      for (const key of obj) {
        x[this.primaryString(key)] = this.get(key);
      }
      return this.getHook(x);
    }
    let key;
    if (typeof obj == "object") {
      key = this.primaryString(obj);
    } else {
      key = `${key}`;
    }
    return this.getHook(this.data[key]);
  };

  getSortedTimes = () => {
    return Object.values(this.data)
      .map(({ time }) => time)
      .sort(cmp_Date);
  };

  close = () => {
    if (this.state === "closed") {
      // already closed
      return;
    }
    this.setState("closed");
    this.removeAllListeners();
    this.dstream?.close();
    delete this.dstream;
  };

  delete = async (_obj) => {
    throw Error("delete: not implemented for stream synctable");
  };

  save = () => {
    this.dstream?.save();
  };

  has_uncommitted_changes = () => {
    return this.dstream?.hasUnsavedChanges();
  };
}
