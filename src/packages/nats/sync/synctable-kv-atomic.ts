/*


TODO: This is a kv store where you atomically do updates.  The way this is written, two clents
might make a change to the same object at the same time and one overwrites the other.
However, I just realized with NATS we can easily prevent this!! There is a version
option to update, so using that instead of put make it possible to detect if there's a
potential conflict, then fix and retry!!!

(See packages/nats/sync/kv.ts for how to do this properly!)

   * Updates the existing entry provided that the previous sequence
   * for the Kv is at the specified version. This ensures that the
   * KV has not been modified prior to the update.
   * @param k
   * @param data
   * @param version
  update(k: string, data: Payload, version: number): Promise<number>;


The synctable-kv.ts file has another one where each key:value in a single object is its own key:value
in the store.

*/

import { keys } from "lodash";
import { client_db } from "@cocalc/util/db-schema/client-db";
import { getKv, toKey, natsKeyPrefix } from "./synctable-kv";
import { type NatsEnv, State } from "@cocalc/nats/types";
import { sha1 } from "@cocalc/util/misc";
import { EventEmitter } from "events";
import { getAllFromKv } from "@cocalc/nats/util";

export class SyncTableKVAtomic extends EventEmitter {
  private kv?;
  private nc;
  private jc;
  private sha1;
  public readonly natsKeyPrefix;
  public readonly table;
  private primaryKeys: string[];
  private project_id?: string;
  private account_id?: string;
  private state: State = "disconnected";
  private watches: any[] = [];

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
    this.natsKeyPrefix = natsKeyPrefix({ query, atomic: true });
    this.project_id = project_id ?? query[table][0].project_id;
    this.account_id = account_id ?? query[table][0].account_id;
    this.primaryKeys = client_db.primary_keys(table);
  }

  private set_state = (state: State): void => {
    this.state = state;
    this.emit(state);
  };

  get_state = () => {
    return this.state;
  };

  init = async () => {
    this.kv = await getKv({
      nc: this.nc,
      project_id: this.project_id,
      account_id: this.account_id,
    });
    this.set_state("connected");
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

  getKey = (obj): string => {
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

  get = async (obj?, options: { natsKeys?: boolean } = {}) => {
    if (obj == null) {
      const { all: raw } = await getAllFromKv({
        kv: this.kv,
        key: `${this.natsKeyPrefix}.>`,
      });
      if (options.natsKeys) {
        // gets everything as a map with NATS keys but decoded values.
        // This is used by the database changefeed stuff.
        for (const key in raw) {
          raw[key] = this.jc.decode(raw[key]);
        }
        return raw;
      }
      const all: any = {};
      for (const x of Object.values(raw)) {
        const value = this.jc.decode(x);
        all[this.primaryString(value)] = value;
      }
      return all;
    } else {
      return this.decode(await this.kv.get(this.getKey(obj)));
    }
  };

  // watch for new changes
  async *watch() {
    if (this.kv == null) {
      throw Error("not initialized");
    }
    const w = await this.kv.watch({
      key: `${this.natsKeyPrefix}.>`,
      include: "updates",
    });
    this.watches.push(w);
    for await (const { value } of w) {
      if (this.state == "closed") {
        return;
      }
      yield this.jc.decode(value);
    }
  }

  close = () => {
    this.set_state("closed");
    this.removeAllListeners();
    for (const w of this.watches) {
      w.stop();
    }
    this.watches = [];
  };
}
