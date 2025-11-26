import { Map as iMap, fromJS } from "immutable";
import type { ChatMessage } from "./types";
import { getThreadRootDate } from "./utils";

export function initFromSyncDB({ syncdb, store }) {
  const v = {};
  for (let x of syncdb.get().toJS()) {
    x = processSyncDBObj(x);
    if (x != null) {
      v[x.date.valueOf()] = x;
    }
  }
  store.setState({
    messages: fromJS(v),
  });
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
        if (record == null) {
          drafts = drafts.delete(obj.sender_id);
        } else {
          const sender_id = record.get("sender_id");
          drafts = drafts.set(sender_id, record);
        }
        store.setState({ drafts });
        return;
      }

      case "chat": {
        let changed: boolean = false;
        let messages = store.get("messages") ?? iMap();
        obj.date = new Date(obj.date);
        const record = syncdb.get_one(obj);
        let x = record?.toJS();
        if (x == null) {
          // delete
          messages = messages.delete(`${obj.date.valueOf()}`);
          changed = true;
        } else {
          x = processSyncDBObj(x);
          if (x != null) {
            messages = messages.set(`${x.date.valueOf()}`, fromJS(x));
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

// NOTE: x must be already a plain JS object (.toJS()).
// This function mutates x.
export function processSyncDBObj(x: ChatMessage): ChatMessage | undefined {
  if (x.event !== "chat") {
    // Event used to be used for video chat, etc...; but we have a better approach now, so
    // all events we care about are chat.
    return;
  }
  if ((x as any).video_chat?.is_video_chat) {
    // discard/ignore anything else related to the old old video chat approach
    return;
  }
  x.date = new Date(x.date);
  if ((x.history?.length ?? 0) > 0) {
    // nontrivial history -- nothing to do
  } else if ((x as any).payload != null) {
    // for old chats with payload: content (2014-2016)... plus the script @hsy wrote in the work project ;-(
    x.history = [];
    x.history.push({
      content: (x as any).payload.content,
      author_id: x.sender_id,
      date: new Date(x.date).toISOString(),
    });
    delete (x as any).payload;
  } else if ((x as any).mesg != null) {
    // for old chats with mesg: content (up to 2014)
    x.history = [];
    x.history.push({
      content: (x as any).mesg.content,
      author_id: x.sender_id,
      date: new Date(x.date).toISOString(),
    });
    delete (x as any).mesg;
  }
  if (x.history == null) {
    x.history = [];
  }
  if (!x.editing) {
    x.editing = {};
  }
  x.folding ??= [];
  x.feedback ??= {};
  return x;
}
