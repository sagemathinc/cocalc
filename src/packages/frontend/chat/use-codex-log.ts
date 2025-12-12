import { useEffect, useMemo, useState } from "react";
import { appendStreamMessage } from "@cocalc/chat";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export interface CodexLogOptions {
  projectId?: string;
  logStore?: string | null;
  logKey?: string | null;
  logSubject?: string | null;
  generating?: boolean;
  legacyEvents?: any;
}

export interface CodexLogResult {
  events: any[] | undefined;
  hasLogRef: boolean;
  deleteLog: () => Promise<void>;
}

/**
 * Fetch Codex/ACP logs from AKV and live stream from conat during generation.
 * Resets state when the log key changes so logs don't bleed across turns.
 */
export function useCodexLog({
  projectId,
  logStore,
  logKey,
  logSubject,
  generating,
  legacyEvents,
}: CodexLogOptions): CodexLogResult {
  const hasLogRef = Boolean(logStore && logKey);
  const legacy =
    useMemo(() => {
      if (!legacyEvents) return undefined;
      if (typeof (legacyEvents as any)?.toJS === "function") {
        return (legacyEvents as any).toJS();
      }
      return legacyEvents;
    }, [legacyEvents]) ?? undefined;

  const [fetchedLog, setFetchedLog] = useState<any[] | null>(null);
  const [liveLog, setLiveLog] = useState<any[]>([]);

  // Reset when log ref changes.
  useEffect(() => {
    setFetchedLog(null);
    setLiveLog([]);
  }, [logKey, logStore, logSubject]);

  // Load from AKV once per key.
  useEffect(() => {
    let cancelled = false;
    async function fetchLog() {
      if (!hasLogRef || !projectId || fetchedLog != null) return;
      try {
        const cn = webapp_client.conat_client.conat();
        const kv = cn.sync.akv<any[]>({
          project_id: projectId,
          name: logStore!,
        });
        const data = await kv.get(logKey!);
        if (!cancelled) {
          setFetchedLog(data ?? []);
        }
      } catch (err) {
        console.warn("failed to fetch acp log", err);
      }
    }
    void fetchLog();
    return () => {
      cancelled = true;
    };
  }, [hasLogRef, projectId, logStore, logKey, fetchedLog]);

  // Subscribe to live events while generating.
  useEffect(() => {
    let sub: any;
    let stopped = false;
    async function subscribe() {
      if (!generating || !logSubject) return;
      try {
        const cn = webapp_client.conat_client.conat();
        sub = await cn.subscribe(logSubject);
        for await (const mesg of sub) {
          if (stopped) break;
          const evt = mesg?.data;
          if (!evt) continue;
          setLiveLog((prev) => appendStreamMessage(prev ?? [], evt));
        }
      } catch (err) {
        console.warn("live log subscribe failed", err);
      }
    }
    void subscribe();
    return () => {
      stopped = true;
      try {
        sub?.close?.();
      } catch {
        // ignore
      }
    };
  }, [generating, logSubject]);

  const events = useMemo(() => {
    // Prefer live stream, then persisted log, then legacy.
    if (liveLog.length > 0) return liveLog;
    if (hasLogRef && fetchedLog) return fetchedLog;
    if (legacy && (!hasLogRef || !generating)) return legacy;
    if (generating && hasLogRef) return liveLog;
    return hasLogRef ? fetchedLog ?? legacy : legacy ?? (generating ? liveLog : undefined);
  }, [hasLogRef, fetchedLog, liveLog, generating, legacy]);

  const deleteLog = async () => {
    if (!hasLogRef || !projectId || !logStore || !logKey) return;
    try {
      const cn = webapp_client.conat_client.conat();
      const kv = cn.sync.akv({ project_id: projectId, name: logStore });
      await kv.delete(logKey);
    } catch (err) {
      console.warn("failed to delete acp log", err);
    }
    setFetchedLog(null);
    setLiveLog([]);
  };

  return { events, hasLogRef, deleteLog };
}
