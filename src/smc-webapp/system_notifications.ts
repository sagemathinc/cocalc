const misc = require("smc-util/misc");
const { defaults, required } = misc;
import { OrderedMap, Map } from "immutable";
import { Actions, Table, Store, redux } from "./app-framework";
const { alert_message } = require("./alerts");
import { debug } from "./feature";
import { once } from "smc-util/async-utils";
import * as LS from "misc/local-storage";

export const NAME = "system_notifications";

export type Priority = "high" | "info";
export type Message = Map<string, any>;
export type Messages = OrderedMap<string, any>;

interface NotificationsState {
  loading: boolean;
  notifications?: Messages;
  announcements?: Messages;
  show_announcement?: Message; // which announcement to show
  have_next: boolean;
  have_previous: boolean;
  dismissed_info?: any; // string or timestamp
  dismissed_high?: any; // string or timestamp
}

const INIT_STATE: NotificationsState = {
  loading: true,
  have_next: false,
  have_previous: false
};

export class NotificationsStore extends Store<NotificationsState> {}

export class NotificationsActions extends Actions<NotificationsState> {
  show_banner = (show = true): void => {
    // this controls if the global banner is shown
    const page_actions = redux.getActions("page");
    page_actions.setState({ show_global_info: show });
  };

  update = (dismissed_high, dismissed_info): void => {
    debug("NotificationsActions::update", { dismissed_info, dismissed_high });
    this.setState({ dismissed_info, dismissed_high });
    this.process_all_messages();
  };

  process_all_messages(): void {
    this.process_announcements();
  }

  private process_announcements(): void {
    // announcements ordered by newest first
    const announcements = store.get("announcements");
    if (announcements == null) return;
    const start: number = store.get("dismissed_info", 0);
    const newest = announcements.first();
    if (newest == null) return;
    const time = newest.get("time").getTime();
    // show newest announcement iff it is newer than the last dismissed update
    if (time > start) {
      this.set_show_announcement(newest);
    }
  }

  dismiss_all = (priority: Priority): void => {
    const announcements = store.get("announcements");
    if (announcements == null) return;
    // first (newest) entry with the given priority
    const first = announcements.find(mesg => mesg.get("priority") == priority);
    const time = first != null ? first.get("time").getTime() : undefined;
    redux
      .getTable("account")
      .set({ other_settings: { [`notification_${priority}`]: time } });
  };

  private set_show_announcement(mesg: Message | undefined) {
    // also update first/last button status
    const id = mesg != null ? mesg.get("id") : undefined;
    const announcements = store.get("announcements");
    if (announcements == null) return;
    const first = announcements.first();
    const last = announcements.last();
    const have_previous = last != null && last.get("id") != id;
    const have_next = first != null && first.get("id") != id;
    actions.setState({ show_announcement: mesg, have_next, have_previous });
  }

  private skip(forward: boolean) {
    const a = store.get("announcements");
    if (a == null) return;

    const current = store.get("show_announcement");
    if (current == null) return;

    const announcements = forward ? a : a.reverse();
    const current_time = current.get("time").getTime();

    // linear scan, and we lag one behind
    let next_mesg: undefined | Message = undefined;
    let first = true;
    announcements.forEach((mesg, _id) => {
      const time = mesg.get("time", new Date(0));
      if (forward ? time > current_time : time < current_time || first) {
        next_mesg = mesg;
      } else {
        return false;
      }
      first = false;
    });

    this.set_show_announcement(next_mesg);
  }

  next = (): void => this.skip(true);

  previous = (): void => this.skip(false);

  send_message = (opts): void => {
    opts = defaults(opts, {
      id: misc.uuid(),
      time: new Date(),
      text: required,
      priority: "high" as Priority
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

class NotificationsTable extends Table {
  private recent: any; // a date ?

  query() {
    return NAME;
  }

  private process_mesg(_id, mesg): void {
    debug("system_notifications::process_mesg", mesg);
    switch (mesg.priority as Priority) {
      case "high":
        // filter old messages or those which are marked "done"
        if (mesg.time < this.recent || mesg.done) return;

        const lt = mesg.time.toLocaleString();
        const message = `SYSTEM MESSAGE (${lt}): ${mesg.text}`;
        alert_message({
          type: "info" as Priority,
          message,
          timeout: 3600
        });
        break;

      case "info":
        debug("show info message", mesg);
        break;
    }
  }

  options() {
    return [];
  }

  _change = (table, _keys) => {
    console.log("_change", table.get());
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
const store = redux.createStore(NAME, NotificationsStore, INIT_STATE);
const actions = redux.createActions(NAME, NotificationsActions);

/******************************************************************/

const NAME_ANNOUNCEMENTS = "announcements";

class AnnouncementsTable extends Table {
  query() {
    return NAME_ANNOUNCEMENTS;
  }

  options() {
    return [];
  }

  change = table => {
    const announcements = table.get().sortBy(a => -a.get("time").getTime());
    actions.setState({ loading: false, announcements });
    actions.process_all_messages();
  };

  _change = (table, _keys) => {
    debug("_change announcements:", table.get());
    this.change(table);
  };
}

const ann_table = redux.createTable("announcements", AnnouncementsTable);

// TODO why is this necessary? what does it do?
(async () => {
  const table = redux.getTable("announcements")._table;
  await once(table, "connected");
  ann_table.change(table);
})();
