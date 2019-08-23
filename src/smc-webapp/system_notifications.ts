const misc = require("smc-util/misc");
const { defaults, required } = misc;
import { OrderedMap, Map } from "immutable";
import { Actions, Table, Store, redux } from "./app-framework";
const { alert_message } = require("./alerts");
import { debug } from "./feature";
import { once } from "smc-util/async-utils";
import * as LS from "misc/local-storage";

export const NAME = "system_notifications";

export type Notification = Map<string, any>;
export type Notifications = OrderedMap<string, any>; // iMap<string, any>>;

interface NotificationsState {
  loading: boolean;
  notifications?: Notifications;
  announcements?: Notifications;
  show_announcement?: string; // which announcement to show
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
    if (page_actions == null) return;
    page_actions.setState({ show_global_info: show });
  };

  update = (dismissed_high, dismissed_info): void => {
    debug("NotificationsActions::update", { dismissed_info, dismissed_high });
    this.setState({
      dismissed_info,
      dismissed_high
    });
    this.process_announcements();
    this.show_banner(true);
  };

  process_announcements(): void {
    // announcements ordered by newest first
    const announcements = store.get("announcements");
    if (announcements == null) {
      return;
    }
    let show_id: undefined | string = undefined;
    const start: number | null = store.get("dismissed_info");
    announcements.forEach((mesg, id) => {
      const time = mesg.get("time", new Date(0));
      debug("announcements::process", time, time.getTime(), start);
      if (time.getTime() > (start || 0)) {
        show_id = id;
      } else {
        return false;
      }
    });
    this.set_show_announcement(show_id);
  }

  dismiss = (): void => {
    const announcements = store.get("announcements");
    if (announcements == null) return;

    const id = store.get("show_announcement");
    if (id == null) return;

    const current = announcements.get(id);
    if (current == null) return;
    const time = current.get("time").getTime();
    redux
      .getTable("account")
      .set({ other_settings: { notification_info: time } });
  };

  private set_show_announcement(id: string | undefined) {
    // also update first/last button status
    const announcements = store.get("announcements");
    if (announcements == null) return;
    const first = announcements.first();
    const last = announcements.last();
    const have_previous = last != null && last.get("id") != id;
    const have_next = first != null && first.get("id") != id;
    actions.setState({ show_announcement: id, have_next, have_previous });
  }

  private skip(forward: boolean) {
    const a = store.get("announcements");
    if (a == null) return;

    const id = store.get("show_announcement");
    if (id == null) return;

    const announcements = forward ? a : a.reverse();
    const current = announcements.get(id);
    if (current == null) return;
    const current_time = current.get("time").getTime();

    // linear scan, and we lag one behind
    let show_id: undefined | string = undefined;
    let first = true;
    announcements.forEach((mesg, id) => {
      const time = mesg.get("time", new Date(0));
      if (time > current_time || first) {
        show_id = id;
      } else {
        return false;
      }
      first = false;
    });

    this.set_show_announcement(show_id);
  }

  next = (): void => this.skip(true);

  previous = (): void => this.skip(false);

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

class NotificationsTable extends Table {
  private recent: any; // a date ?

  query() {
    return NAME;
  }

  private process_mesg(_id, mesg): void {
    debug("system_notifications::process_mesg", mesg);
    switch (mesg.priority) {
      case "high":
        // filter old messages or those which are marked "done"
        if (mesg.time < this.recent || mesg.done) return;

        const lt = mesg.time.toLocaleString();
        const message = `SYSTEM MESSAGE (${lt}): ${mesg.text}`;
        alert_message({
          type: "info",
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
    actions.process_announcements();
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
