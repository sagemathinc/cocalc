/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Synchronized table of all public paths.

DESIGN NOTE:
The approach below preloads into RAM info about all public paths.
It should in theory easily scale up to probably 100K+ distinct public paths.
By keeping everything in RAM, the share servers will be faster (basically
never hitting the DB before returning results).  And, since we have everything
in memory, we can do a lot of stupid things involving iterating over everything
before writing proper queries.
*/

import { EventEmitter } from "events";
import * as immutable from "immutable";
import { Database } from "./types";
import { callback2, once, retry_until_success } from "smc-util/async-utils";
import { bind_methods, cmp } from "smc-util/misc2";
import { containing_public_path } from "smc-util/misc";

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
      f: this.init.bind(this),
    });
    this.is_ready = true;
    this.emit("ready");
  }

  public get(
    id: string | string[]
  ): HostInfo | immutable.Map<string, HostInfo> | undefined {
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
    for (const host of t.split(",")) {
      this.vhosts[host] = info;
    }
  }

  private delete_vhost(info: HostInfo): void {
    const t = info.get("vhost");
    if (t == null) return;
    for (const host of t.split(",")) {
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
          info.get("path"),
        ]);
      } else {
        x.add(info.get("path"));
      }
      this.add_vhost(info);
    }
    this.last_public_paths = this.synctable.get(); // TODO: very inefficient?
  }

  public get_id(project_id: string, path: string): string {
    return this.database.sha1(project_id, path);
  }

  public get_info(project_id: string, path: string): HostInfo | undefined {
    const id: string = this.get_id(project_id, path);
    return this.get(id);
  }

  // Returns the required token, if one is required.  A token is required
  // if the share is unlisted *and* a token is set for that share.
  public required_token(project_id: string, path: string): string | undefined {
    const info = this.get_info(project_id, path);
    if (info == null) return; // not even public
    if (info.get("unlisted")) return info.get("token");
    return undefined; // not unlisted
  }

  public public_path(project_id: string, path: string): string | undefined {
    const paths = this.public_paths_in_project[project_id];
    if (paths == null) {
      return undefined;
    }
    return containing_public_path(path, paths);
  }

  // True if project_id/path is contained in some public path,
  // which may or may not be unlisted.
  public is_public(project_id: string, path: string): boolean {
    const paths = this.public_paths_in_project[project_id];
    if (paths == null) {
      return false;
    }
    return containing_public_path(path, paths) != null;
  }

  public is_access_allowed(
    project_id: string, // the project_id
    path: string, // a path of an actual share.
    token: string | undefined // token for access (ignored unless unlisted *and* set in database)
  ): boolean {
    const required_token: string | undefined = this.required_token(
      project_id,
      path
    );
    if (required_token) {
      return required_token == token;
    } else {
      return true;
    }
  }

  public get_views(project_id: string, path: string): number | undefined {
    const info = this.get_info(project_id, path);
    if (info == null) return;
    return info.get("counter");
  }

  public async increment_view_counter(
    project_id: string, // the project_id
    path: string // a path of an actual share.
  ): Promise<void> {
    const id: string = this.get_id(project_id, path);
    await callback2(this.database._query, {
      query: `UPDATE public_paths SET counter=coalesce(counter,0)+1 WHERE id='${id}'`,
    });
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
    const ids = v.map((x) => x[1]);
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
        "license",
        "token",
        "compute_image",
      ],
      where: "disabled IS NOT TRUE",
    });
    this.synctable.on("change", (id) => {
      // TODO: just delete cached for now..., but
      // this is horrible and we must make this
      // way more efficient!
      delete this._order;
      this.update_public_paths(id);
    });
    this.init_public_paths();
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
