import { Map as iMap, fromJS } from "immutable";
import { normalizeChatMessage } from "./normalize";

export function initFromSyncDB({}: { syncdb: any; store: any }) {}

export function handleSyncDBChange({
  syncdb,
  store,
  changes,
}: {
  syncdb: any;
  store: any;
  changes: Set<Record<string, unknown>> | Record<string, unknown>[] | undefined;
}): void {
  if (!syncdb || !store || changes == null) {
    console.warn("handleSyncDBChange: inputs should not be null");
    return;
  }

  const activityReady = store.get("activityReady") === true;
  const rows = Array.isArray(changes) ? changes : Array.from(changes);

  for (const obj of rows) {
    const event = (obj as any)?.event;
    const sender_id = (obj as any)?.sender_id;
    const date = (obj as any)?.date;
    const where: any = {};
    if (event != null) where.event = event;
    if (sender_id != null) where.sender_id = sender_id;
    if (date != null) where.date = date;

    if (event === "draft") {
      let drafts = store.get("drafts") ?? (fromJS({}) as any);
      const record = syncdb.get_one(where);
      const key = `${sender_id}:${date}`;
      if (record == null) {
        drafts = drafts.delete(key);
      } else {
        drafts = drafts.set(key, record);
      }
      store.setState({ drafts });
      continue;
    }

    if (event === "chat") {
      const record = syncdb.get_one(where);
      if (!record) continue;
      const { message } = normalizeChatMessage(record);
      if (!activityReady || !message) continue;
      const root = message.reply_to
        ? new Date(message.reply_to).valueOf()
        : message.date.valueOf();
      const key = `${root}`;
      const now = Date.now();
      const activity = (store.get("activity") ?? iMap()).set(key, now);
      store.setState({ activity });
      continue;
    }

    console.warn("unknown chat event: ", event);
  }

  if (!activityReady) {
    store.setState({ activityReady: true });
  }
}
