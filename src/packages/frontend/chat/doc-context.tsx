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
import type { PlainChatMessage } from "./types";
import { ChatMessageCache } from "./message-cache";

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
  cache: cacheProp,
  children,
}: {
  syncdb?: ImmerDB;
  cache?: ChatMessageCache;
  children: React.ReactNode;
}) {
  const [version, setVersion] = useState<number>(0);
  const cacheRef = useRef<ChatMessageCache | null>(null);

  useEffect(() => {
    const cache = cacheProp ?? new ChatMessageCache(syncdb);
    cacheRef.current = cache;
    const onVersion = (v: number) => setVersion(v);
    cache.onVersion(onVersion);
    // ensure initial version is reflected
    setVersion(cache.getVersion());
    return () => {
      cache.offVersion(onVersion);
      if (!cacheProp) {
        cache.dispose();
      }
    };
  }, [syncdb, cacheProp]);

  const cache = cacheRef.current;
  const value = useMemo<DocCtx>(
    () => ({
      syncdb: cache?.getSyncdb(),
      doc: cache?.getSyncdb()?.get(),
      version,
      messages: cache?.getMessages(),
    }),
    [cache, version],
  );

  return (
    <ChatDocContext.Provider value={value}>{children}</ChatDocContext.Provider>
  );
}

export function useChatDoc(): DocCtx {
  return useContext(ChatDocContext);
}
