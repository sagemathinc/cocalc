/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  defaults,
  required,
  from_json,
  to_json,
  get_local_storage,
  minutes_ago,
  set_local_storage,
  uuid,
} from "smc-util/misc";

import { Map } from "immutable";
import { COCALC_MINIMAL } from "./fullscreen";
import { Actions, Store, Table, redux } from "./app-framework";
import { alert_message } from "./alerts";

const name = "system_notifications";

interface State {
  loading: boolean;
  notifications: Map<string, any>;
}

class NotificationsActions extends Actions<State> {
  public send_message(opts: {
    id?: string;
    time?: Date;
    text: string;
    priority?: string;
  }): void {
    opts = defaults(opts, {
      id: uuid(),
      time: new Date(),
      text: required,
      priority: "high",
    });
    table?.set(opts);
  }

  // set all known messages to done
  public mark_all_done(): void {
    store.get("notifications")?.map((mesg, id) => {
      if (!mesg.get("done")) {
        table?.set({ id, done: true });
      }
    });
  }
}

class NotificationsStore extends Store<State> {}

const store: NotificationsStore = redux.createStore(name, NotificationsStore, {
  loading: true,
  notifications: Map<string, any>(),
});
const actions = redux.createActions(name, NotificationsActions);

class NotificationsTable extends Table {
  public query(): string {
    return "system_notifications";
  }

  protected _change(table, _keys): void {
    actions.setState({ loading: false, notifications: table.get() });
    const t = get_local_storage("system_notifications");
    let s;
    if (t != null) {
      s = from_json(t);
    } else {
      s = {};
    }
    // show any message from the last hour that we haven't seen already
    const recent = minutes_ago(60);
    table.get().map((m, id) => {
      if (s[id] == null) {
        const mesg = m.toJS();
        if (mesg.time >= recent && mesg.priority === "high" && !mesg.done) {
          s[id] = mesg.time;
          alert_message({
            type: "info",
            message: `SYSTEM MESSAGE (${mesg.time.toLocaleString()}): ${
              mesg.text
            }`,
            timeout: 3600,
          });
        }
      }
    });
    // also delete older stuff from localStorage.system_notifications
    for (const id in s) {
      const x = s[id];
      if (x.time < recent) {
        delete s[id];
      }
    }
    set_local_storage("system_notifications", to_json(s));
  }
}

let table: NotificationsTable | undefined = undefined;
if (!COCALC_MINIMAL) {
  table = redux.createTable(name, NotificationsTable);
}
