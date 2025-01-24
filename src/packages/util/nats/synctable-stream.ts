/*
Nats implementation of the idea of a "SyncTable", but 
for streaming data.

This is ONLY for the scope of patches in a single project.

It uses a NATS stream to store the elements in a well defined order.


*/

import { jetstreamManager, jetstream } from "@nats-io/jetstream";
import sha1 from "sha1";
import jsonStableStringify from "json-stable-stringify";
import { keys } from "lodash";
import { isValidUUID } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/db-schema/client-db";

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

export class SyncTableStream {
  private kv?;
  private nc;
  private jc;
  private sha1;
  private table;
  private primaryKeys: string[];
  private primaryKeysSet: Set<string>;
  private fields: string[];
  private project_id: string;
  private streamName: string;
  private path: string;
  private subject: string;
  private consumer?;

  constructor({ query, env }: { query; env: NatsEnv }) {
    this.sha1 = env.sha1 ?? sha1;
    this.nc = env.nc;
    this.jc = env.jc;
    const table = keys(query)[0];
    this.table = table;
    this.project_id = query[table][0].project_id;
    if (!isValidUUID(this.project_id)) {
      throw Error("query MUST specify a valid project_id");
    }
    this.path = query[table][0].path;
    if (!this.path) {
      throw Error("path MUST be specified");
    }
    query[table][0].string_id = this.sha1(`${this.project_id}${this.path}`);
    this.streamName = `${this.table}-${query[table][0].string_id}`;
    this.subject = `project.${this.project_id}.${this.table}.${query[table][0].string_id}`;
    this.primaryKeys = client_db.primary_keys(table);
    this.primaryKeysSet = new Set(this.primaryKeys);
    this.fields = keys(query[table][0]).filter(
      (field) => !this.primaryKeysSet.has(field),
    );
  }

  private createStream = async () => {
    const jsm = await jetstreamManager(this.nc);
    try {
      await jsm.streams.add({
        name: this.streamName,
        subjects: [this.subject],
        compression: "s2",
      });
    } catch (_err) {
      // probably already exists
      await jsm.streams.update(this.streamName, {
        subjects: [this.subject],
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
    this.getMessages();
  };

  private primaryString = (obj): string => {};

  private natObjectKey = (obj): string => {};

  private getKey = (obj, field?: string): string => {};

  private publish = (mesg) => {
    this.nc.publish(this.subject, this.jc.encode(mesg));
  };

  set = async (obj) => {
    delete obj["string_id"]; // redundant
    this.publish(obj);
  };

  private handle = (mesg) => {
    const x = this.jc.decode(mesg.data);
    console.log(x);
    return false;
  };

  private getMessages = async () => {
    const consumer = this.consumer!;
    const messages = await consumer.fetch({
      max_messages: 100000,
    });
    for await (const mesg of messages) {
      if (this.handle(mesg)) {
        return;
      }
      if (mesg.info.pending == 0) {
        // no further messages
        break;
      }
    }
    for await (const mesg of await consumer.consume()) {
      if (this.handle(mesg)) {
        return;
      }
    }
  };

  get = async (obj?, field?) => {
    console.log("get: TODO");
  };
}
