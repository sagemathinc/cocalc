/*
Nats implementation of the idea of a "SyncTable".
*/

import { Kvm } from "@nats-io/kv";
import sha1 from "sha1";
import jsonStableStringify from "json-stable-stringify";
import { keys } from "lodash";
import { isValidUUID } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/db-schema/client-db";

export async function getKv({ nc, table }) {
  const kvm = new Kvm(nc);
  return await kvm.create(table, { compression: true });
}

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

export class SyncTable {
  private kv?;
  private nc;
  private jc;
  private sha1;
  private table;
  private primaryKeys: string[];
  private primaryKeysSet: Set<string>;
  private fields: string[];
  private project_id: string;

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
    this.primaryKeys = client_db.primary_keys(table);
    this.primaryKeysSet = new Set(this.primaryKeys);
    this.fields = keys(query[table][0]).filter(
      (field) => !this.primaryKeysSet.has(field),
    );
  }

  init = async () => {
    this.kv = await getKv({ nc: this.nc, table: this.table });
  };

  private natObjectKey = (obj): string => {
    if (obj == null) {
      throw Error("obj must be an object (not null)");
    }
    // Function this.to_key to extract primary key from object
    if (this.primaryKeys.length === 1) {
      return this.sha1(toKey(obj[this.primaryKeys[0]] ?? ""));
    } else {
      // compound primary key
      return this.sha1(toKey(this.primaryKeys.map((pk) => obj[pk])));
    }
  };

  private getKey = (obj, field?: string): string => {
    const x = `${this.project_id}.${this.natObjectKey(obj)}`;
    if (field == null) {
      return x;
    } else {
      return `${x}.${field}`;
    }
  };

  set = async (obj) => {
    const key = this.getKey(obj);
    for (const field in obj) {
      if (!this.primaryKeysSet.has(field)) {
        const value = this.jc.encode(obj[field]);
        await this.kv.put(`${key}.${field}`, value);
      }
    }
  };

  get = async (obj, field?) => {
    if (field == null) {
      const s = { ...obj };
      const key = this.getKey(obj);
      let nontrivial = false;
      for (const field of this.fields) {
        const mesg = await this.kv.get(`${key}.${field}`);
        const val = mesg?.sm?.data ? this.jc.decode(mesg.sm.data) : null;
        if (val != null) {
          s[field] = val;
          nontrivial = true;
        }
      }
      return nontrivial ? s : undefined;
    }
    const mesg = await this.kv.get(this.getKey(obj, field));
    if (mesg == null) {
      return undefined;
    }
    return this.jc.decode(mesg.sm.data);
  };

  // watch for changes in ONE object
  async *watchOne(obj) {
    const w = await this.kv.watch({
      key: this.getKey(this.getKey(obj), "*"),
    });
    for await (const { key, value } of w) {
      const field = key.slice(key.lastIndexOf(".") + 1);
      yield { [field]: this.jc.decode(value) };
    }
  }
}
