/*
Synchronized table of all public paths.

This will easily scale up to probably 100K+ distinct public paths, which will take year(s) to reach,
and by keeping everything in RAM, the share servers will be very, very fast (basically never hitting
the DB before returning results).  And, since we have everything in memory, we can do a lot of stupid
things involving iterating over everything before writing proper queries.
*/

import { EventEmitter } from "events";
import * as immutable from "immutable";
import { Database } from "./types";
import { callback2, once, retry_until_success } from "smc-util/async-utils";
import { cmp, bind_methods } from "smc-util/misc2";
import { containing_public_path } from "smc-util/misc";
import { Author } from "smc-webapp/share/types";

export type HostInfo = immutable.Map<string, any>;

export class PublicPaths extends EventEmitter {
  public is_ready: boolean = false;
  private synctable: any;
  private vhosts: { [hostname: string]: HostInfo } = {};
  private public_paths_in_project: { [project_id: string]: Set<string> } = {};
  private last_public_paths?: immutable.Map<string, any>;
  private _order?: immutable.List<string>;
  private database: Database;

  constructor(database: Database) {
    super();

    bind_methods(this, ["is_public"]); // it gets passed around
    this.database = database;
    this.do_init();
  }

  private async do_init(): Promise<void> {
    await retry_until_success({
      f: this.init.bind(this)
    });
    this.is_ready = true;
    this.emit("ready");
  }

  public get(id: string): HostInfo | undefined {
    if (!this.is_ready) throw Error("not yet ready");
    return this.synctable.get(id);
  }

  public get_all(): immutable.Map<string, any> {
    if (!this.is_ready) throw Error("not yet ready");
    return this.synctable.get();
  }

  private add_vhost(info: HostInfo): void {
    const t = info.get("vhost");
    if (t == null) return;
    for (let host of t.split(",")) {
      this.vhosts[host] = info;
    }
  }

  private delete_vhost(info: HostInfo): void {
    const t = info.get("vhost");
    if (t == null) return;
    for (let host of t.split(",")) {
      delete this.vhosts[host];
    }
  }

  // returns immutable.js public path with given vhost or undefined.
  public get_vhost(hostname: string): HostInfo | undefined {
    return this.vhosts[hostname];
  }

  private init_public_paths(): void {
    const v = this.public_paths_in_project;

    // TWe track in order to deal with deletes.
    this.last_public_paths = this.synctable.get();
    // TODO: This may be horribly inefficient as the number of public
    // paths gets large, and we need to rewrite this.

    if (this.last_public_paths == null) throw Error("bug!");
    this.last_public_paths.forEach((info: HostInfo) => {
      const project_id = info.get("project_id");
      if (project_id == null) throw Error("bug");
      if (v[project_id] == null) {
        v[project_id] = new Set([info.get("path")]);
      } else {
        v[project_id].add(info.get("path"));
      }
      this.add_vhost(info);
    });
  }

  private update_public_paths(id: string): void {
    let info = this.get(id);
    if (info == null) {
      if (this.last_public_paths == null) throw Error("bug");
      info = this.last_public_paths.get(id);
      if (info != null) {
        const x = this.public_paths_in_project[info.get("project_id")];
        if (x != null) {
          x.delete(info.get("path"));
        }
        this.delete_vhost(info);
      }
    } else {
      let x: undefined | Set<string> = this.public_paths_in_project[
        info.get("project_id")
      ];
      if (x == null) {
        x = this.public_paths_in_project[info.get("project_id")] = new Set([
          info.get("path")
        ]);
      } else {
        x.add(info.get("path"));
      }
      this.add_vhost(info);
    }
    this.last_public_paths = this.synctable.get(); // TODO: very inefficient?
  }

  public is_public(project_id: string, path: string): boolean {
    const paths = this.public_paths_in_project[project_id];
    if (paths == null) {
      return false;
    }
    return !!containing_public_path(path, paths);
  }

  // Immutables List of ids that sorts the public_paths from
  // newest (last edited) to oldest. This only includes paths
  // that are not unlisted.
  public order(): immutable.List<string> {
    if (this._order != null) {
      return this._order;
    }
    const v: [number, string][] = [];
    this.synctable
      .get()
      .forEach((info: immutable.Map<string, any>, id: string) => {
        if (!info.get("unlisted")) {
          v.push([info.get("last_edited", 0), id]);
        }
      });
    v.sort((a, b) => -cmp(a[0], b[0]));
    const ids = v.map(x => x[1]);
    this._order = immutable.fromJS(ids);
    if (this._order == null) throw Error("bug"); // make typescript happier
    return this._order;
  }

  private async init(): Promise<void> {
    this.synctable = await callback2(this.database.synctable, {
      table: "public_paths",
      columns: [
        "id",
        "project_id",
        "path",
        "description",
        "created",
        "last_edited",
        "last_saved",
        "counter",
        "vhost",
        "auth",
        "unlisted",
        "license"
      ],
      where: "disabled IS NOT TRUE"
    });
    this.synctable.on("change", id => {
      // TODO: just delete cached for now..., but
      // this is horrible and we must make this
      // way more efficient!
      delete this._order;
      this.update_public_paths(id);
    });
    this.init_public_paths();
  }

  public async get_authors(
    project_id: string,
    path: string
  ): Promise<Author[]> {
    const id: string = this.database.sha1(project_id, path);
    const result = await callback2(this.database._query, {
      query: `SELECT users FROM syncstrings WHERE string_id='${id}'`
    });
    if (result == null || result.rowCount < 1) return [];
    const account_ids: string[] = [];
    for (let account_id of result.rows[0].users) {
      if (account_id != project_id) {
        account_ids.push(account_id);
      }
    }
    const authors: Author[] = [];
    const names = await callback2(this.database.get_usernames, {
      account_ids,
      cache_time_s: 60 * 5
    });
    for (let account_id in names) {
      // todo really need to sort by last name
      const { first_name, last_name } = names[account_id];
      const name = `${first_name} ${last_name}`;
      authors.push({ name, account_id });
    }
    authors.sort((a, b) =>
      cmp(names[a.account_id].last_name, names[b.account_id].last_name)
    );
    return authors;
  }

  public async get_username(account_id: string): Promise<string> {
    const names = await callback2(this.database.get_usernames, {
      account_ids: [account_id],
      cache_time_s: 60 * 5
    });
    const { first_name, last_name } = names[account_id];
    return `${first_name} ${last_name}`;
  }
}

let the_public_paths: PublicPaths | undefined = undefined;
export async function get_public_paths(
  database: Database
): Promise<PublicPaths> {
  if (the_public_paths != null) {
    if (the_public_paths.is_ready) {
      return the_public_paths;
    }
  } else {
    the_public_paths = new PublicPaths(database);
  }
  await once(the_public_paths, "ready");
  return the_public_paths;
}
