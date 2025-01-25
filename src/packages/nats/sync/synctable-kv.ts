/*
Nats implementation of the idea of a "SyncTable".

This is ONLY for synctables in the scope of a single project, e.g.,
syncstrings, listings, etc.

It uses a SINGLE NATS key-value store to represent
*all* SyncTables in a single project.
*/

import { Kvm } from "@nats-io/kv";
import sha1 from "sha1";
import jsonStableStringify from "json-stable-stringify";
import { keys } from "lodash";
import { isValidUUID } from "@cocalc/util/misc";
import { client_db } from "@cocalc/util/db-schema/client-db";

export async function getKv({ nc, project_id }) {
  const kvm = new Kvm(nc);
  return await kvm.create(`project-${project_id}`, { compression: true });
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

export class SyncTableKV {
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
    this.kv = await getKv({ nc: this.nc, project_id: this.project_id });
  };

  private primaryString = (obj): string => {
    if (this.primaryKeys.length === 1) {
      return toKey(obj[this.primaryKeys[0]] ?? "")!;
    } else {
      // compound primary key
      return toKey(this.primaryKeys.map((pk) => obj[pk]))!;
    }
  };

  private natObjectKey = (obj): string => {
    if (obj == null) {
      throw Error("obj must be an object (not null)");
    }
    return this.sha1(this.primaryString(obj));
  };

  private getKey = (obj, field?: string): string => {
    const x = `${this.table}.${this.natObjectKey(obj)}`;
    if (field == null) {
      return x;
    } else {
      return `${x}.${field}`;
    }
  };

  set = async (obj) => {
    const key = this.getKey(obj);
    for (const field in obj) {
      const value = this.jc.encode(obj[field]);
      await this.kv.put(`${key}.${field}`, value);
    }
  };

  get = async (obj?, field?) => {
    if (obj == null) {
      // everything known in this table by the project
      const keys = await this.kv.keys(`${this.table}.>`);
      const all: any = {};
      for await (const key of keys) {
        const mesg = await this.kv.get(key);
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
      const final: any = {};
      for (const k in all) {
        final[this.primaryString(all[k])] = all[k];
      }
      return final;
    }
    if (field == null) {
      const s = { ...obj };
      const key = this.getKey(obj);
      let nontrivial = false;
      // todo: possibly better to just ask for everything under ${key}.>
      // and take what is needed?  Not sure.
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
