/*
Nats implementation of the idea of a "SyncTable", but
for streaming data.

This is ONLY for the scope of patches in a single project.

It uses a NATS stream to store the elements in a well defined order.


*/

import { jetstreamManager, jetstream } from "@nats-io/jetstream";
import jsonStableStringify from "json-stable-stringify";
import { keys } from "lodash";
import { cmp_Date, is_array, isValidUUID, sha1 } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/db-schema/client-db";
import { EventEmitter } from "events";

export type State = "disconnected" | "connected" | "closed";

interface NatsEnv {
  nc; // nats connection
  jc; // jsoncodec
  // compute sha1 hash efficiently (set differently on backend)
  sha1?: (string) => string;
}

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
  private nc;
  private jc;
  private sha1;
  public readonly table;
  private primaryKeys: string[];
  private project_id?: string;
  private account_id?: string;
  private streamName: string;
  private streamSubject: string;
  private path: string;
  private subject: string;
  private string_id: string;
  private data: any = {};
  private consumer?;
  private state: State = "disconnected";

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
    this.sha1 = env.sha1 ?? sha1;
    this.nc = env.nc;
    this.jc = env.jc;
    const table = keys(query)[0];
    this.table = table;
    if (table != "patches") {
      throw Error("only the patches table is supported");
    }
    this.project_id = project_id ?? query[table][0].project_id;
    this.account_id = account_id ?? query[table][0].account_id;
    if (!isValidUUID(this.project_id)) {
      throw Error("query MUST specify a valid project_id");
    }
    if (this.account_id && !isValidUUID(this.account_id)) {
      throw Error("query MUST specify a valid account_id");
    }
    this.path = query[table][0].path;
    if (!this.path) {
      throw Error("path MUST be specified");
    }
    query[table][0].string_id = this.string_id = this.sha1(
      `${this.project_id}${this.path}`,
    );
    this.streamName = `project-${this.project_id}-${this.table}`;
    this.streamSubject = `project.${this.project_id}.${this.table}.>`;
    this.subject = `project.${this.project_id}.${this.table}.${query[table][0].string_id}`;
    this.primaryKeys = client_db.primary_keys(table);
  }

  private createStream = async () => {
    const jsm = await jetstreamManager(this.nc);
    try {
      await jsm.streams.add({
        name: this.streamName,
        subjects: [this.streamSubject],
        compression: "s2",
      });
    } catch (err) {
      console.log("createStream", err);
      // probably already exists
      await jsm.streams.update(this.streamName, {
        subjects: [this.streamSubject],
        compression: "s2" as any,
      });
    }
  };

  private getConsumer = async () => {
    const js = jetstream(this.nc);
    const jsm = await jetstreamManager(this.nc);
    // making an ephemeral consumer
    const { name } = await jsm.consumers.add(this.streamName, {
      filter_subject: this.subject,
    });
    return await js.consumers.get(this.streamName, name);
  };

  init = async () => {
    await this.createStream();
    this.consumer = await this.getConsumer();
    await this.readData();
    this.set_state("connected");
    this.listenForUpdates();
  };

  private set_state = (state: State): void => {
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

  private publish = (mesg) => {
    // console.log("publishing ", { subject: this.subject, mesg });
    this.nc.publish(this.subject, this.jc.encode(mesg));
  };

  set = (obj) => {
    // console.log("set", obj);
    // delete string_id since it is redundant info
    const key = this.primaryString(obj);
    if (this.data[key] != null) {
      // no changes to existing keys -- just ignore.
      // TODO?
      // console.log("set - skip", obj);
      return;
    }
    const { string_id, ...obj2 } = obj;
    // console.log("set - publish", obj);
    this.publish(obj2);
  };

  private handle = (mesg, changeEvent: boolean) => {
    if (this.state == "closed") {
      return true;
    }
    const obj = this.jc.decode(mesg.data);
    const key = this.primaryString(obj);
    this.data[key] = { ...obj, time: new Date(obj.time) };
    if (this.data[key].prev != null) {
      this.data[key].prev = new Date(this.data[key].prev);
    }
    if (changeEvent) {
      this.emit("change", [key]);
    }
    return false;
  };

  // load initial data
  private readData = async () => {
    const consumer = this.consumer!;
    const messages = await consumer.fetch({
      max_messages: 100000,
      expires: 1000,
    });
    for await (const mesg of messages) {
      if (this.handle(mesg, false)) {
        return;
      }
      if (mesg.info.pending == 0) {
        // no further messages
        break;
      }
    }
  };

  // listen for new data
  private listenForUpdates = async () => {
    const consumer = this.consumer!;
    for await (const mesg of await consumer.consume()) {
      if (this.handle(mesg, true)) {
        return;
      }
    }
  };

  get = (obj?) => {
    if (obj == null) {
      // CAREFUL
      return this.data;
    }
    if (typeof obj == "string") {
      return this.data[obj];
    }
    if (is_array(obj)) {
      const x: any = {};
      for (const key of obj) {
        x[this.primaryString(key)] = this.get(key);
      }
      return x;
    }
    let key;
    if (typeof obj == "object") {
      key = this.primaryString(obj);
    } else {
      key = `${key}`;
    }
    return this.data[key];
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
    this.set_state("closed");
    this.removeAllListeners();
    this.consumer?.delete();
    delete this.consumer;
  };

  delete = async (_obj) => {
    throw Error("delete: not implemented for stream synctable");
  };

  // no-op because we always immediately publish changes on set.
  save = () => {};
  has_uncommitted_changes = () => {
    // todo - if disconnected (?)
    return false;
  };
}
