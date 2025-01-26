import sha1 from "sha1";
import { keys } from "lodash";
import { client_db } from "@cocalc/util/db-schema/client-db";
import { getKv, toKey, type NatsEnv, natsKeyPrefix } from "./synctable-kv";

export class SyncTableKVAtomic {
  private kv?;
  private nc;
  private jc;
  private sha1;
  public readonly natsKeyPrefix;
  public readonly table;
  private primaryKeys: string[];
  private project_id?: string;
  private account_id?: string;

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
    this.sha1 = env.sha1 ?? sha1;
    this.nc = env.nc;
    this.jc = env.jc;
    const table = keys(query)[0];
    this.table = table;
    this.natsKeyPrefix = natsKeyPrefix({ query, atomic: true });
    this.project_id = project_id ?? query[table][0].project_id;
    this.account_id = account_id ?? query[table][0].account_id;
    this.primaryKeys = client_db.primary_keys(table);
  }

  init = async () => {
    this.kv = await getKv({
      nc: this.nc,
      project_id: this.project_id,
      account_id: this.account_id,
    });
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

  private getKey = (obj): string => {
    return `${this.natsKeyPrefix}.${this.natObjectKey(obj)}`;
  };

  set = async (obj) => {
    const key = this.getKey(obj);
    const value = this.jc.encode(obj);
    await this.kv.put(key, value);
  };

  delete = async (obj) => {
    await this.kv.delete(this.getKey(obj));
  };

  private decode = (mesg) => {
    return mesg?.sm?.data != null ? this.jc.decode(mesg.sm.data) : null;
  };

  get = async (obj?) => {
    if (obj == null) {
      // everything
      const keys = await this.kv.keys(`${this.natsKeyPrefix}.>`);
      const all: any = {};
      for await (const key of keys) {
        const value = this.decode(await this.kv.get(key));
        all[this.primaryString(value)] = value;
      }
      return all;
    }
    return this.decode(await this.kv.get(this.getKey(obj)));
  };

  // watch for changes
  async *watch() {
    const w = await this.kv.watch({
      key: `${this.natsKeyPrefix}.>`,
    });
    for await (const { value } of w) {
      const obj = this.jc.decode(value);
      yield { [this.primaryString(obj)]: obj };
    }
  }
}
