import { Map as iMap, fromJS } from "immutable";
import { getThreadRootDate } from "./utils";
import { normalizeChatMessage } from "./normalize";

export function initFromSyncDB({ syncdb, store }) {
  const v = {};
  let upgradedCount = 0;
  const rows: any[] =
    typeof syncdb.get().toJS === "function" ? syncdb.get().toJS() : syncdb.get();
  for (let x of rows) {
    const originalDate = x?.date;
    const { message, upgraded } = normalizeChatMessage(x);
    if (message != null) {
      v[message.date.valueOf()] = message;
      if (upgraded) {
        // Preserve the original PK encoding to avoid duplicate rows.
        const patch = {
          ...message,
          date: originalDate ?? message.date,
        };
        syncdb.set(patch);
        upgradedCount++;
      }
    }
  }
  store.setState({
    messages: fromJS(v),
  });
  if (upgradedCount > 0) {
    syncdb.commit();
  }
}

export function handleSyncDBChange({ syncdb, store, changes }) {
  if (syncdb == null || store == null || changes == null) {
    console.warn("handleSyncDBChange: inputs should not be null");
    return;
  }
  const primaryKeys = ["date", "sender_id", "event"];
  const activityReady = store.get("activityReady") === true;
  const raw =
    typeof (changes as any).toJS === "function" ? (changes as any).toJS() : changes;
  const rows: any[] = Array.isArray(raw)
    ? raw
    : raw == null
    ? []
      : typeof (raw as any).values === "function"
        ? Array.from((raw as any).values())
        : [raw];
  rows.map((obj) => {
    const where = primaryKeys.reduce((acc: any, key) => {
      if (obj[key] != null) {
        acc[key] = obj[key];
      }
      return acc;
    }, {});
    switch (obj.event) {
      case "draft": {
        let drafts = store.get("drafts") ?? (fromJS({}) as any);
        // used to show that another user is editing a message.
        const record = syncdb.get_one(where);
        const key = `${obj.sender_id}:${obj.date}`;
        if (record == null) {
          drafts = drafts.delete(key);
        } else {
          drafts = drafts.set(
            key,
            typeof (record as any)?.toJS === "function"
              ? (record as any).toJS()
              : record,
          );
        }
        store.setState({ drafts });
        return;
      }

      case "chat": {
        let changed: boolean = false;
        let messages = store.get("messages") ?? iMap();
        const record = syncdb.get_one(where);
        const x =
          typeof (record as any)?.toJS === "function" ? record.toJS() : record;
        if (x == null) {
          // delete
          messages = messages.delete(`${obj.date.valueOf()}`);
          changed = true;
        } else {
          const { message } = normalizeChatMessage(x);
          if (message != null) {
            messages = messages.set(
              `${message.date.valueOf()}`,
              fromJS(message),
            );
            changed = true;
          }
        }
        if (changed) {
          store.setState({ messages });
          if (activityReady) {
            const root =
              getThreadRootDate({
                date: obj.date.valueOf(),
                messages,
              }) ?? obj.date.valueOf();
            const key = `${root}`;
            const now = Date.now();
            const activity = (store.get("activity") ?? iMap()).set(key, now);
            store.setState({ activity });
          }
        }
        return;
      }

      default:
        console.warn("unknown chat event: ", obj.event);
    }
  });
  if (!activityReady) {
    store.setState({ activityReady: true });
  }
}
