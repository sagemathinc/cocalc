const misc = require("smc-util/misc");
const { defaults, required } = misc;
import { Map as iMap } from "immutable";
import { Actions, Table, Store, redux } from "./app-framework";
const { alert_message } = require("./alerts");

export const NAME = "system_notifications";

interface NotificationsState {
  loading: boolean;
  notifications: iMap<string, iMap<string, any>>; // ???
}

class NotificationsStore extends Store<NotificationsState> {}

class NotificationsActions extends Actions<NotificationsState> {
  send_message = opts => {
    opts = defaults(opts, {
      id: misc.uuid(),
      time: new Date(),
      text: required,
      priority: "high"
    });
    table.set(opts);
  };

  // set all recent messages to done
  mark_all_done = () => {
    const notifications = store.get("notifications");
    if (notifications == null) return;
    notifications.map((mesg, id) => {
      if (!mesg.get("done")) {
        table.set({ id, done: true });
      }
    });
  };
}

const store = redux.createStore(NAME, NotificationsStore, { loading: true });
const actions = redux.createActions(NAME, NotificationsActions);

class NotificationsTable extends Table {
  private recent: any; // a date ?
  private s: object; // cache of local storage object

  query() {
    return NAME;
  }

  private process_mesg(id, mesg): void {
    if (mesg.time < this.recent && mesg.done) return;

    switch (mesg.priority) {
      case "high":
        this.s[id] = mesg.time;
        const lt = mesg.time.toLocaleString();
        const message = `SYSTEM MESSAGE (${lt}): ${mesg.text}`;
        alert_message({
          type: "info",
          message,
          timeout: 3600
        });
        break;

      case "info":
        console.log("show info message", mesg);
        break;
    }
  }

  options() {
    return [];
  }

  _change = (table, _keys) => {
    actions.setState({ loading: false, notifications: table.get() });
    const t = misc.get_local_storage(NAME);
    const s = (this.s = t != null ? misc.from_json(t) : {});
    // show any message from the last hour that we have not seen already
    this.recent = misc.minutes_ago(60);
    table.get().map((m, id) => {
      if (s[id] == null) {
        this.process_mesg(id, m.toJS());
      }
    });
    // also delete older stuff from localStorage.system_notifications
    for (let id in s) {
      const x = s[id];
      if (x.time < this.recent) {
        delete s[id];
      }
    }
    misc.set_local_storage(NAME, misc.to_json(s));
  };
}

const table = redux.createTable(NAME, NotificationsTable);
