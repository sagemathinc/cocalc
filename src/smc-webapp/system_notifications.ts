const misc = require("smc-util/misc");
const { defaults, required } = misc;
import { uuid } from "smc-util/misc2";
import { ReactElement } from "react";
import { OrderedMap, Map } from "immutable";
import { Actions, Table, Store, redux } from "./app-framework";
import { createTypedMap, TypedMap } from "./app-framework/TypedMap";
import { alert_message } from "./alerts";
import { debug } from "./feature";
import { once } from "smc-util/async-utils";
import * as LS from "./misc/local-storage";
import { Alert } from "./alerts";

export const NAME_SYSTEM = "system_notifications";

export type Priority = "high" | "info" | "alert";

// the order sets their priority -- alerts are right "now" for the specific instance, very important.
// notifications are sent by the administrators, and announcements are long-term, not immediately important.
enum MessageTypes {
  "alerts",
  "notifications",
  "announcements"
}

type MessageType = keyof typeof MessageTypes;

// TODO somehow figure out how to use a TypedMap for actual typing
export type Message = TypedMap<{
  id: string;
  priority: Priority;
  time: any; // time type ?
  title?: string | ReactElement<any>;
  text?: string | ReactElement<any> | Error;
  done?: boolean;
}>;
export const MessageObject = createTypedMap<Message>();

// TODO mapping string to Message breaks somehow
export type Messages = OrderedMap<string, any>;

type NewestMessages = { [mt in MessageType]: Message | undefined };

function sort_messages(messages: Messages): Messages {
  // we sort by time. this is an opportunity to also sort by priority.
  return messages.sortBy(a => -a.get("time").getTime());
}

interface NotificationsState {
  loading: boolean;
  notifications?: Messages;
  announcements?: Messages;
  alerts?: Messages;
  messages?: Messages; // synthesized ordered map of notifications+announcements
  current_message?: Message; // which message to display
  newest_messages?: NewestMessages; // to decide if an update contains a new message
  previous_messages?: Messages;
  have_next: boolean;
  have_previous: boolean;
  dismissed_info?: any; // string or timestamp
  dismissed_high?: any; // string or timestamp
}

const INIT_STATE: NotificationsState = {
  loading: true,
  have_next: false,
  have_previous: false,
  alerts: OrderedMap<string, any>(),
  announcements: OrderedMap<string, any>(),
  notifications: OrderedMap<string, any>()
};

const first = val => (val != null ? val.first() : undefined);

export class NotificationsStore extends Store<NotificationsState> {
  private get_newest_messages(): NewestMessages {
    const x = Object.keys(MessageTypes).map((mt: MessageType) => {
      return { mt: first(store.get(mt)) };
    });
    return Object.assign({}, ...x);
  }

  get_newer_message(): {
    newer_msg: Message | undefined;
    newest_messages: NewestMessages;
  } {
    const prev_newest = this.get("newest_messages");
    const cur_newest = this.get_newest_messages();

    if (prev_newest != null) {
      Object.keys(MessageTypes).map((mt: MessageType) => {
        const newest_msg = first(this.get(mt));
        if (newest_msg != cur_newest[mt]) {
          return { newer_msg: newest_msg, newest_messages: cur_newest };
        }
      });
    }
    return { newer_msg: undefined, newest_messages: cur_newest };
  }
}

export class NotificationsActions extends Actions<NotificationsState> {
  private show_banner(show = true): void {
    // this controls if the global banner is shown
    const page_actions = redux.getActions("page");
    page_actions.setState({ show_global_info: show });
  }

  update = (dismissed_high, dismissed_info): void => {
    debug("NotificationsActions::update", { dismissed_info, dismissed_high });
    this.setState({ dismissed_info, dismissed_high });
    this.process_all_messages();
  };

  process_all_messages(): void {
    // messages ordered by newest first
    const messages: Messages = sort_messages(
      (store.get("announcements") || Map<string, any>())
        .merge(store.get("notifications") || Map<string, any>())
        .merge(store.get("alerts") || Map<string, any>())
    );
    this.setState({ messages });

    const start: number = store.get("dismissed_info") || 0;
    const newest = messages.first();

    // there are no messages
    if (newest == null) return;

    // check if there are new messages
    const { newer_msg, newest_messages } = store.get_newer_message();
    this.setState({ newest_messages });
    const current = store.get("current_message");

    if (current != null) {
      // do not disturb what someone is currently looking at a message, unless a new one pops up
      if (current != newer_msg) {
        this.set_current_message(newer_msg);
        this.show_banner(true);
      }
    } else {
      // show newest announcement iff it is newer than the last dismissed update
      const time = newest.get("time").getTime();
      if (time > start) {
        this.set_current_message(newest);
        this.show_banner(true);
      }
    }
    this.setState({ previous_messages: messages });
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

  private set_current_message(mesg: Message | undefined) {
    // also update first/last button status
    const id = mesg != null ? mesg.get("id") : undefined;
    const announcements = store.get("announcements");
    if (announcements == null) return;
    const first = announcements.first();
    const last = announcements.last();
    const have_previous = last != null && last.get("id") != id;
    const have_next = first != null && first.get("id") != id;
    actions.setState({ current_message: mesg, have_next, have_previous });
  }

  private skip(forward: boolean) {
    const a = store.get("announcements");
    if (a == null) return;

    const current = store.get("current_message");
    if (current == null) return;

    const announcements = forward ? a : a.reverse();
    const current_time = current.get("time").getTime();

    // linear scan, and we lag one behind
    let next_mesg: undefined | Message = undefined;
    let first = true;
    announcements.forEach((mesg, _id) => {
      const time = mesg.get("time") || new Date(0);
      if (forward ? time > current_time : time < current_time || first) {
        next_mesg = mesg;
      } else {
        return false;
      }
      first = false;
    });

    this.set_current_message(next_mesg);
  }

  next = (): void => this.skip(true);

  previous = (): void => this.skip(false);

  create_alert = (alert: Alert): void => {
    const id = uuid();
    const priority = "alert" as Priority;
    const alert_msg = new MessageObject(
      Object.assign({}, alert, { id, priority })
    );
    const alerts = store.get("alerts") || Map<string, any>();
    this.setState({ alerts: sort_messages(alerts.set(id, alert_msg)) });
    this.process_all_messages();
  };

  // ADMIN ONLY
  send_message = (opts): void => {
    opts = defaults(opts, {
      id: uuid(),
      time: new Date(),
      text: required,
      priority: "high" as Priority
    });
    table.set(opts);
  };

  // ADMIN ONLY: set all recent messages to done
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

  constructor(name, redux) {
    super(name, redux);
    this._change = this._change.bind(this);
  }

  query() {
    return NAME_SYSTEM;
  }

  private process_mesg(_id, mesg): void {
    debug("system_notifications::process_mesg", mesg);
    // we only care about priority = high
    if (mesg.priority != ("high" as Priority)) return;

    // filter old messages or those which are marked "done"
    if (mesg.time < this.recent || mesg.done) return;

    const lt = mesg.time.toLocaleString();
    const message = `SYSTEM MESSAGE (${lt}): ${mesg.text}`;
    alert_message({
      type: "info" as Priority,
      message,
      timeout: 3600
    });
  }

  options() {
    return [];
  }

  change = table => {
    const notifications = sort_messages(table.get());
    actions.setState({
      loading: false,
      notifications: sort_messages(notifications)
    });
    actions.process_all_messages();

    // show any message from the last hour that we have not seen already
    this.recent = misc.minutes_ago(60);
    table.get().map((m, id) => {
      this.process_mesg(id, m.toJS());
    });

    // delete old entries from localStorage.system_notifications
    LS.del(NAME_SYSTEM);
  };

  _change(table, _keys): void {
    console.log(`_change ${NAME_SYSTEM}:`, table.get());
    this.change(table);
  }
}

const table = redux.createTable(NAME_SYSTEM, NotificationsTable);
const store = redux.createStore(NAME_SYSTEM, NotificationsStore, INIT_STATE);
const actions = redux.createActions(NAME_SYSTEM, NotificationsActions);

/******************************************************************/

const NAME_ANNOUNCE = "announcements";

class AnnouncementsTable extends Table {
  constructor(name, redux) {
    super(name, redux);
    this._change = this._change.bind(this);
  }

  query() {
    return NAME_ANNOUNCE;
  }

  options() {
    return [];
  }

  change = table => {
    const announcements = sort_messages(table.get());
    actions.setState({
      loading: false,
      announcements: sort_messages(announcements)
    });
    actions.process_all_messages();
  };

  _change(table, _keys): void {
    debug(`_change ${NAME_ANNOUNCE}:`, table.get());
    this.change(table);
  }
}

const ann_table = redux.createTable(NAME_ANNOUNCE, AnnouncementsTable);

// TODO why is this necessary? what does it do?
(async () => {
  const redux_announce_table = redux.getTable(NAME_ANNOUNCE)._table;
  await once(redux_announce_table, "connected");
  ann_table.change(redux_announce_table);
})();

(async () => {
  const redux_sysnoti_table = redux.getTable(NAME_SYSTEM)._table;
  await once(redux_sysnoti_table, "connected");
  table.change(redux_sysnoti_table);
})();
