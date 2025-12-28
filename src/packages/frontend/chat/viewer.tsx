/*
Used for viewing a list of messages, e.g., in timetravel.
*/

import { useMemo } from "react";

import type { Document } from "@cocalc/sync/editor/generic/types";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { MessageList, getSortedDates } from "./chat-log";
import type { ChatMessages } from "./types";
import { historyArray } from "./access";

export default function Viewer({
  doc,
  font_size,
}: {
  doc: () => Document | undefined;
  font_size?: number;
}) {
  const messages = useMemo<ChatMessages>(() => {
    const m = new Map<string, any>();
    const d = doc();
    if (d == null) {
      return m;
    }
    for (const v of d.get()) {
      const event = (v as any)?.event ?? (v as any)?.get?.("event");
      if (event !== "chat") continue;
      const rawDate = (v as any)?.date ?? (v as any)?.get?.("date");
      const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (Number.isNaN(date.valueOf())) continue;
      const rawHistory = (v as any)?.history ?? (v as any)?.get?.("history");
      const msg = {
        ...(typeof (v as any)?.toJS === "function" ? (v as any).toJS() : v),
        date,
        history: historyArray({ history: rawHistory }),
      };
      m.set(`${date.valueOf()}`, msg);
    }
    return m as unknown as ChatMessages;
  }, [doc]);
  const user_map = useTypedRedux("users", "user_map");
  const account_id = useTypedRedux("account", "account_id");
  const { dates: sortedDates, numChildren } = useMemo(() => {
    return getSortedDates(messages, account_id, undefined);
  }, [messages, account_id]);

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
