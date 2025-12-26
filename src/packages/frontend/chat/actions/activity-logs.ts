/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { deriveAcpLogRefs } from "@cocalc/chat";
import { delay } from "awaiting";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { ChatActions } from "../actions";
import type { ChatMessage, ChatMessages } from "../types";
import { dateValue } from "../access";
import { getThreadRootDate } from "../utils";

export type ActivityLogContext = {
  actions?: ChatActions;
  message: ChatMessage;
  messages?: ChatMessages;
  threadRootMs?: number;
  project_id?: string;
  path?: string;
};

export async function deleteActivityLog({
  actions,
  message,
  deleteLog,
}: {
  actions?: ChatActions;
  message: ChatMessage;
  deleteLog?: () => Promise<void>;
}): Promise<void> {
  if (!actions?.syncdb) return;
  const d = dateValue(message);
  if (!(d instanceof Date)) return;
  if (deleteLog) {
    await deleteLog();
  }
  actions.syncdb.set({
    event: "chat",
    date: d.toISOString(),
    acp_events: null,
    codex_events: null,
  });
  actions.syncdb.commit();
}

export async function deleteAllActivityLogs({
  actions,
  messages,
  threadRootMs,
  message,
  project_id,
  path,
}: ActivityLogContext): Promise<void> {
  if (!actions?.syncdb) return;
  const dates: Date[] = [];
  const logRefs: { store: string; key: string }[] = [];
  const rootIso =
    threadRootMs != null ? new Date(threadRootMs).toISOString() : undefined;
  if (rootIso && actions) {
    const seq = actions.getMessagesInThread(rootIso);
    for (const msg of seq ?? []) {
      const d = dateValue(msg);
      if (!(d instanceof Date)) continue;
      dates.push(d);
      if (!project_id || !path) continue;
      const refs = deriveAcpLogRefs({
        project_id,
        path,
        thread_root_date: rootIso,
        turn_date: d.toISOString(),
      });
      logRefs.push({ store: refs.store, key: refs.key });
    }
  } else if (messages?.forEach) {
    messages.forEach((msg) => {
      const d = dateValue(msg);
      if (!(d instanceof Date)) return;
      const root = getThreadRootDate({
        date: d.valueOf(),
        messages,
      });
      const rootMs = root?.valueOf?.();
      if (rootMs != null && rootMs === threadRootMs) {
        dates.push(d);
        if (!project_id || !path || !rootIso) return;
        const refs = deriveAcpLogRefs({
          project_id,
          path,
          thread_root_date: rootIso,
          turn_date: d.toISOString(),
        });
        logRefs.push({ store: refs.store, key: refs.key });
      }
    });
  }
  if (!dates.length) {
    const d = dateValue(message);
    if (d instanceof Date) dates.push(d);
  }
  if (project_id) {
    for (const ref of logRefs) {
      try {
        const cn = webapp_client.conat_client.conat();
        const kv = cn.sync.akv({ project_id, name: ref.store });
        await kv.delete(ref.key);
      } catch (err) {
        console.warn("failed to delete acp log", err);
      }
    }
  }
  let i = 0;
  for (const d of dates) {
    i += 1;
    if (i % 20 == 0) {
      await delay(200);
    }
    actions.syncdb.set({
      event: "chat",
      date: d.toISOString(),
      acp_events: null,
      codex_events: null,
    });
  }
  actions.syncdb.commit();
}
