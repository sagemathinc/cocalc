/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 *
 *  Chat now consumes the live SyncDoc (ImmerDB) directly instead of copying
 *  chat messages into Redux. The ChatDocProvider listens to syncdb "change"
 *  events and exposes the current document via React context; components use
 *  useChatDoc() to access it and derive messages on the fly.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ImmerDB } from "@cocalc/sync/editor/immer-db";
import type { Document } from "@cocalc/sync/editor/generic/types";
import { normalizeChatMessage } from "./normalize";
import type { PlainChatMessage } from "./types";

type DocCtx = {
  syncdb?: ImmerDB;
  doc?: Document;
  version: number;
  messages?: Map<string, PlainChatMessage> | null;
};

const ChatDocContext = createContext<DocCtx>({
  version: 0,
  messages: undefined,
});

export function ChatDocProvider({
  syncdb,
  children,
}: {
  syncdb?: ImmerDB;
  children: React.ReactNode;
}) {
  const [version, setVersion] = useState<number>(0);
  const messagesRef = useRef<Map<string, PlainChatMessage> | null>(null);

  useEffect(() => {
    if (!syncdb) return;
    const doc = syncdb.get();
    const map = new Map<string, PlainChatMessage>();
    for (const row of doc?.get?.() ?? []) {
      const { message } = normalizeChatMessage(row);
      if (message) {
        map.set(`${message.date.valueOf()}`, message);
      }
    }
    messagesRef.current = map;
    setVersion((v) => v + 1);
  }, [syncdb]);

  useEffect(() => {
    if (!syncdb) return;
    const onChange = (changes: Set<Record<string, unknown>> | undefined) => {
      if (!messagesRef.current) {
        messagesRef.current = new Map();
      }
      const m = new Map(messagesRef.current);
      // Patchflow emits a Set of primary-key objects for Db changes.
      const rows: Record<string, unknown>[] =
        changes instanceof Set
          ? Array.from(changes)
          : changes == null
            ? []
            : [changes];
      for (const row of rows) {
        // change payloads may be just primary keys; fetch full record
        const rec = syncdb.get_one(row);
        if (!rec) {
          // deleted row
          const key =
            row?.date != null
              ? `${new Date(row.date as string | number | Date).valueOf()}`
              : undefined;
          if (key != null) {
            m.delete(key);
          }
          continue;
        }
        const { message } = normalizeChatMessage(rec);
        const key =
          message?.date != null
            ? `${message.date.valueOf()}`
            : row?.date
              ? `${new Date(row.date as string).valueOf()}`
              : undefined;
        if (key == null) continue;
        if (message) {
          m.set(key, message);
        } else {
          m.delete(key);
        }
      }
      messagesRef.current = m;
      setVersion((v) => v + 1);
    };
    syncdb.on("change", onChange);
    return () => {
      syncdb.off("change", onChange);
    };
  }, [syncdb]);

  const value = useMemo<DocCtx>(
    () => ({
      syncdb,
      doc: syncdb?.get(),
      version,
      messages: messagesRef.current ?? undefined,
    }),
    [syncdb, version],
  );

  return (
    <ChatDocContext.Provider value={value}>{children}</ChatDocContext.Provider>
  );
}

export function useChatDoc(): DocCtx {
  return useContext(ChatDocContext);
}
