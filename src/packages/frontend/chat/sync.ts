import { Map as iMap, fromJS } from "immutable";
import { normalizeChatMessage } from "./normalize";

export function initFromSyncDB({}: { syncdb: any; store: any }) {}

export function handleSyncDBChange({ syncdb, store, changes }) {
  if (syncdb == null || store == null || changes == null) {
    console.warn("handleSyncDBChange: inputs should not be null");
    return;
  }
  const primaryKeys = ["date", "sender_id", "event"];
  const activityReady = store.get("activityReady") === true;
  const raw =
    typeof (changes as any).toJS === "function"
      ? (changes as any).toJS()
      : changes;
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
        const record = syncdb.get_one(where);
        const x =
          typeof (record as any)?.toJS === "function" ? record.toJS() : record;
        const { message } = normalizeChatMessage(x);
        if (activityReady && message) {
          const root = message.reply_to
            ? new Date(message.reply_to).valueOf()
            : message.date.valueOf();
          const key = `${root}`;
          const now = Date.now();
          const activity = (store.get("activity") ?? iMap()).set(key, now);
          store.setState({ activity });
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
