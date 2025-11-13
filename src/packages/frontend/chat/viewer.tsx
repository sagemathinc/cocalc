/*
Used for viewing a list of messages, e.g., in timetravel.
*/

import { Map as immutableMap } from "immutable";
import { useMemo } from "react";

import type { Document } from "@cocalc/sync/editor/generic/types";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { MessageList, getSortedDates } from "./chat-log";
import type { ChatMessages } from "./types";

export default function Viewer({
  doc,
  font_size,
}: {
  doc: Document;
  font_size?: number;
}) {
  const messages = useMemo<ChatMessages>(() => {
    let m = immutableMap();
    for (let v of doc.get()) {
      if (v.get("event") == "chat") {
        const date = new Date(v.get("date"));
        v = v.set("date", date);
        m = m.set(`${date.valueOf()}`, v);
      }
    }
    return m as ChatMessages;
  }, [doc]);
  const user_map = useTypedRedux("users", "user_map");
  const account_id = useTypedRedux("account", "account_id");
  const { dates: sortedDates, numChildren } = useMemo(() => {
    return getSortedDates(messages, "", account_id, undefined);
  }, [messages]);

  return (
    <MessageList
      messages={messages}
      user_map={user_map}
      account_id={account_id}
      fontSize={font_size}
      mode="standalone"
      sortedDates={sortedDates}
      numChildren={numChildren}
    />
  );
}
