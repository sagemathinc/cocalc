const misc = require("smc-util/misc");
const { defaults, required } = misc;
import { Map as iMap } from "immutable";
import { Actions, Table, Store, redux } from "./app-framework";
const { alert_message } = require("./alerts");
import * as LS from "misc/local-storage";

export const NAME = "system_notifications";

export type Notification = iMap<string, any>;
export type Notifications = iMap<string, any>; // iMap<string, any>>;

interface NotificationsState {
  loading: boolean;
  show?: Notification;
  notifications?: Notifications;
  dismissed_info?: any; // string or timestamp
  dismissed_high?: any; // string or timestamp
}

const init_state: NotificationsState = {
  loading: true
};

class NotificationsStore extends Store<NotificationsState> {}

export class NotificationsActions extends Actions<NotificationsState> {
  show_banner = (show = true): void => {
    // this controls if the global banner is shown
    const page_actions = redux.getActions("page");
    if (page_actions == null) return;
    page_actions.setState({ show_global_info: show });
  };

  update = (dismissed_high, dismissed_info): void => {
    this.setState({
      dismissed_info,
      dismissed_high
    });
    this.show_banner(true);
  };

  dismiss = (show: Notification): void => {
    const priority = show.get("priority");
    const time = show.get("time");
    redux
      .getTable("account")
      .set({ other_settings: { [`notification_${priority}`]: time } });
  };

  send_message = (opts): void => {
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

const store = redux.createStore(NAME, NotificationsStore, init_state);
const actions = redux.createActions(NAME, NotificationsActions);

class NotificationsTable extends Table {
  private recent: any; // a date ?

  query() {
    return NAME;
  }

  private process_mesg(_id, mesg): void {
    if (mesg.time < this.recent && mesg.done) return;

    switch (mesg.priority) {
      case "high":
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

    // show any message from the last hour that we have not seen already
    this.recent = misc.minutes_ago(60);
    table.get().map((m, id) => {
      this.process_mesg(id, m.toJS());
    });
    // delete old entries from localStorage.system_notifications
    LS.del(NAME);
  };
}

const table = redux.createTable(NAME, NotificationsTable);
