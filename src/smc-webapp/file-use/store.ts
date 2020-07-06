/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS, List as iList, Map as iMap } from "immutable";
import { Store } from "../app-framework";
const { webapp_client } = require("../webapp_client");
const misc = require("smc-util/misc");
const { sha1 } = require("smc-util/schema").client_db;

export interface FileUseState {
  errors?: iList<string>;
  file_use?: iMap<string, any>;
  notify_count: number;
}

export class FileUseStore extends Store<FileUseState> {
  private _users: any;
  private _projects: any;
  private _account: any;
  private _account_id: string;
  private _cache_init: boolean = false;
  private _cache: any;

  get_errors(): iList<string> {
    return this.get("errors", iList()) as iList<string>;
  }

  _initialize_cache() {
    this._users = this.redux.getStore("users");
    if (!this._users) {
      return;
    }
    this._projects = this.redux.getStore("projects");
    if (!this._projects) {
      return;
    }
    this._account = this.redux.getStore("account");
    if (!this._account) {
      return;
    }
    this._users.on("change", this.clear_cache);
    this._projects.on("change", this.clear_cache);
    this._account.on("change", () => {
      if (this._account.get_account_id() !== this._account_id) {
        return this.clear_cache();
      }
    });
    this._cache_init = true;
    return true;
  }

  public clear_cache(): void {
    delete this._cache;
  }

  _search(x) {
    const s: string[] = [x.path];
    s.push(this._projects.get_title(x.project_id));
    if (x.users != null) {
      for (const account_id in x.users) {
        s.push(this._users.get_name(account_id));
        if (account_id === this._account_id) {
          s.push("you");
        }
      }
    }
    return s.join(" ").toLowerCase();
  }

  _process_users(y) {
    let user, you_last_chatseen, you_last_read;
    const { users } = y;
    if (users == null || !this._account_id) {
      // account_id **must** be known, or get wrong notify below....
      return;
    }
    // make into list of objects
    const v: any[] = [];
    let newest_chat = 0;
    let you_last_seen = (you_last_read = you_last_chatseen = 0);
    let other_newest_edit_or_chat = 0;
    for (const account_id in users) {
      user = users[account_id];
      user.account_id = account_id;
      user.last_edited = Math.max(
        user.edit != null ? user.edit : 0,
        user.chat != null ? user.chat : 0
      );
      if (user.chat != null) {
        newest_chat = Math.max(newest_chat, user.chat != null ? user.chat : 0);
      }
      user.last_read = Math.max(
        user.last_edited,
        user.read != null ? user.read : 0
      );
      user.last_seen = Math.max(
        Math.max(user.last_read, user.seen != null ? user.seen : 0),
        user.chatseen != null ? user.chatseen : 0
      );
      user.last_used = Math.max(
        user.last_edited,
        user.open != null ? user.open : 0
      );
      if (this._account_id === account_id) {
        you_last_seen = user.last_seen;
        you_last_read = user.last_read;
        you_last_chatseen = user.chatseen != null ? user.chatseen : 0;
      } else {
        other_newest_edit_or_chat = misc.max([
          other_newest_edit_or_chat,
          user.last_edited,
          user.chat != null ? user.chat : 0,
        ]);
      }
      v.push(user);
    }
    // sort users by their edit/chat time
    v.sort((a, b) => misc.cmp(b.last_edited, a.last_edited));
    y.users = v;
    y.newest_chat = newest_chat;
    if (y.last_edited == null) {
      for (user of Array.from(y.users)) {
        y.last_edited = Math.max(
          y.last_edited != null ? y.last_edited : 0,
          user.last_edited
        );
      }
    }
    // Notify you that there is a chat you don't know about at all (so you need to open notification list).
    y.notify = you_last_seen < newest_chat;
    // Show in the notification list that there is a chat you haven't read
    y.show_chat = you_last_read < newest_chat;
    // For our user, we define unread and unseen as follows:
    // - unread: means that the max timestamp for our edit and
    //   read fields is older than another user's edit or chat field
    y.is_unread = you_last_read < other_newest_edit_or_chat;
    // - unseen: means that the max timestamp for our edit, read and seen
    //   fields is older than another edit or chat field
    y.is_unseen = you_last_seen < other_newest_edit_or_chat;
    // - unseen chat: means that you haven't seen the newest chat for this document.
    return (y.is_unseenchat = you_last_chatseen < newest_chat);
  }

  get_notify_count(): number {
    if (this._cache == null) {
      this._update_cache();
    }
    if (this._cache == null) {
      return 0; // not ready yet.
    }
    if (this._cache.notify_count) {
      return this._cache.notify_count;
    }
    return 0;
  }

  get_sorted_file_use_list(): any[] {
    if (this._cache == null) {
      this._update_cache();
    }
    return (this._cache != null
      ? this._cache.sorted_file_use_list
      : undefined) != null
      ? this._cache != null
        ? this._cache.sorted_file_use_list
        : undefined
      : [];
  }

  get_sorted_file_use_list2(): iList<any> {
    if (this._cache == null) {
      this._update_cache();
    }
    return (this._cache != null
      ? this._cache.sorted_file_use_immutable_list
      : undefined) != null
      ? this._cache != null
        ? this._cache.sorted_file_use_immutable_list
        : undefined
      : iList();
  }

  // Get latest processed info about a specific file as an object.
  get_file_info(project_id, path) {
    if (this._cache == null) {
      this._update_cache();
    }
    return this._cache != null
      ? this._cache.file_use_map[sha1(project_id, path)]
      : undefined;
  }

  // Get latest processed info about all use in a particular project.
  get_project_info(project_id) {
    if (this._cache == null) {
      this._update_cache();
    }
    const v = {};
    for (const id in this._cache != null
      ? this._cache.file_use_map
      : undefined) {
      const x = (this._cache != null ? this._cache.file_use_map : undefined)[
        id
      ];
      if (x.project_id === project_id) {
        v[id] = x;
      }
    }
    return v;
  }

  get_file_use_map() {
    if (this._cache == null) {
      this._update_cache();
    }
    return this._cache != null ? this._cache.file_use_map : undefined;
  }

  _update_cache() {
    const file_use = this.get("file_use");
    if (file_use == null) {
      return;
    }
    if (!this._cache_init) {
      this._initialize_cache();
      if (!this._cache_init) {
        return;
      }
    }

    if (this._cache != null) {
      return;
    }

    if (this._account_id == null) {
      this._account_id = this._account.get_account_id();
    }
    let v: any[] = [];
    const file_use_map = {};
    file_use.map((x, id: string) => {
      const y = x.toJS();
      if (y == null) {
        return;
      }
      y.search = this._search(y);
      this._process_users(y);
      v.push(y);
      file_use_map[id] = y;
    });
    const w0: any[] = [];
    const w1: any[] = [];
    const w2: any[] = [];
    for (const a of v) {
      if (a.notify && a.is_unread) {
        w0.push(a);
      } else if (a.show_chat && a.is_unread) {
        w1.push(a);
      } else {
        w2.push(a);
      }
    }
    const c = (a, b) => misc.cmp(b.last_edited, a.last_edited);
    w0.sort(c);
    w1.sort(c);
    w2.sort(c);
    v = w0.concat(w1.concat(w2));

    let notify_count: number = 0;
    for (const x of v) {
      if (x.notify) {
        notify_count += 1;
      }
    }

    this._cache = {
      sorted_file_use_list: v,
      file_use_map,
      sorted_file_use_immutable_list: fromJS(v),
      notify_count,
    };
    require("browser").set_window_title();
    return v;
  }

  // See above for the definition of unread and unseen.
  get_all_unread(): any[] {
    return this.get_sorted_file_use_list().filter(
      (x) => x != null && x.is_unread
    );
  }

  get_all_unseen(): any[] {
    return this.get_sorted_file_use_list().filter(
      (x) => x != null && x.is_unseen
    );
  }

  /* Return active users... across all projects, a given project, or a given
     path in a project, depending on whether project_id or path is specified.
     Returns info as a map

     {account_id:[{project_id:?, path:?, last_used:?},
        {project_id:?, path:?, last_used:?}, ...}]}

     Here last_used is the server timestamp (in milliseconds) of when they were
     last active there, and project_id, path are what they were using.
     Will return undefined in no data available yet.
  */
  get_active_users(opts: {
    project_id?: string; // optional; if not given provide info about all projects
    path?: string; // if given, provide info about specific path in specific project only.
    max_age_s?: number;
  }) {
    if (!opts.max_age_s) {
      opts.max_age_s = 600;
    }
    // user is active if they were active within this amount of time
    let files: any = undefined;
    if (opts.project_id != null && opts.path != null) {
      // users for a particular file
      const t = this.get_file_info(opts.project_id, opts.path);
      if (t != null) {
        files = { _: t }; // TODO: what does _ mean?
      }
    } else if (opts.project_id != null) {
      // a particular project
      files = this.get_project_info(opts.project_id);
    } else {
      // across all projects
      files = this.get_file_use_map();
    }
    if (files == null) {
      // no data yet -- undefined signifies this.
      return;
    }
    const users = {};
    const now = webapp_client.server_time().valueOf();
    const cutoff = now - opts.max_age_s * 1000;
    for (const id in files) {
      const info = files[id];
      for (const account_id in info.users) {
        const user = info.users[account_id];
        const time = user.last_used != null ? user.last_used : 0;
        // Note: we filter in future, since would be bad/buggy data.  (database could disallow...?)
        if (time >= cutoff && time <= now + 60000) {
          // new enough?
          (users[user.account_id] != null
            ? users[user.account_id]
            : (users[user.account_id] = [])
          ).push({
            // create array if necessary, then push data about it
            last_used: user.last_used != null ? user.last_used : 0,
            project_id: info.project_id,
            path: info.path,
          });
        }
      }
    }
    return users;
  }

  get_video_chat_users(opts: {
    project_id: string;
    path: string;
    ttl?: number; // time in ms; if timestamp of video chat is older than this, ignore
  }) {
    if (!opts.ttl) {
      opts.ttl = 120000;
    }
    const users: { [account_id: string]: Date } = {};
    const cutoff: number = webapp_client.server_time().valueOf() - opts.ttl;
    const file_use: iMap<string, any> | undefined = this.get("file_use");
    if (file_use == null) {
      return users;
    }
    const users_map: iMap<string, any> = file_use.getIn([
      sha1(opts.project_id, opts.path),
      "users",
    ]);
    if (users_map == null) {
      return users;
    }
    users_map.forEach(function (info: iMap<string, any>, account_id: string) {
      const timestamp = info.get("video");
      if (timestamp != null && timestamp.valueOf() >= cutoff) {
        users[account_id] = timestamp;
      }
    });
    return users;
  }
}
