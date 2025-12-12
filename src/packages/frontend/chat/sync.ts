import { Map as iMap, fromJS } from "immutable";
import { getThreadRootDate } from "./utils";
import { normalizeChatMessage } from "./normalize";

export function initFromSyncDB({ syncdb, store }) {
  const v = {};
  let upgradedCount = 0;
  for (let x of syncdb.get().toJS()) {
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
  const activityReady = store.get("activityReady") === true;
  changes.map((obj) => {
    obj = obj.toJS();
    switch (obj.event) {
      case "draft": {
        let drafts = store.get("drafts") ?? (fromJS({}) as any);
        // used to show that another user is editing a message.
        const record = syncdb.get_one(obj);
        const key = `${obj.sender_id}:${obj.date}`;
        if (record == null) {
          drafts = drafts.delete(key);
        } else {
          drafts = drafts.set(key, record);
        }
        store.setState({ drafts });
        return;
      }

      case "chat": {
        let changed: boolean = false;
        let messages = store.get("messages") ?? iMap();
        const record = syncdb.get_one(obj);
        let x = record?.toJS();
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
