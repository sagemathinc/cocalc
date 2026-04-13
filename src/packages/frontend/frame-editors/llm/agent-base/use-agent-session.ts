/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared React hook for agent session management.

Encapsulates all the state and SyncDB lifecycle logic that is common
to the coding agent, notebook agent, and future agent types:

- SyncDB initialization (embedded mode via chat syncdb, or standalone
  mode via a hidden meta file)
- Session (turn) management: listing, creating, switching, clearing
- Message read/write and change-listener wiring
- Session naming (optional, used by coding agent)
- Auto-scroll to bottom on new messages
- Refs for avoiding stale closures in SyncDB event handlers
*/

import { useCallback, useEffect, useRef, useState } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { hidden_meta_file, uuid } from "@cocalc/util/misc";

import type { AgentSession, DisplayMessage, WriteMessageParams } from "./types";
import { agentSenderId, SYNCDB_CHANGE_THROTTLE } from "./types";

// Tracks the last ISO timestamp written in standalone mode.  When two
// writes land in the same millisecond, we bump the timestamp by 1 ms
// so the (session_id, date) primary key stays unique AND the date
// remains a valid ISO string that sorts correctly on reload.
let lastStandaloneDate = "";
const MAX_STORED_AGENT_SESSIONS = 100;

interface SessionOrderInfo {
  sessionId: string;
  earliestDate: string;
}

export function getSessionsToPrune(
  sessions: SessionOrderInfo[],
  {
    maxSessions = MAX_STORED_AGENT_SESSIONS,
    protectedSessionIds = new Set<string>(),
  }: {
    maxSessions?: number;
    protectedSessionIds?: Set<string>;
  } = {},
): string[] {
  if (sessions.length <= maxSessions) return [];

  const prunable = sessions.filter(
    ({ sessionId }) => !protectedSessionIds.has(sessionId),
  );
  const pruneCount = Math.min(prunable.length, sessions.length - maxSessions);
  return prunable.slice(0, pruneCount).map(({ sessionId }) => sessionId);
}

/* ------------------------------------------------------------------ */
/*  Hook options                                                       */
/* ------------------------------------------------------------------ */

export interface UseAgentSessionOptions {
  /** The chat SyncDB when running embedded in the side chat. */
  chatSyncdb?: any;
  /**
   * An already-existing SyncDB instance to use directly (e.g. the
   * frame editor's own _syncstring).  Records are NOT filtered by
   * eventName — all records are included.  Unlike `chatSyncdb`, no
   * chat-schema mapping (sender_id, msg_event) is applied.
   */
  existingSyncdb?: any;
  /**
   * The event name that identifies this agent's records in the chat
   * syncdb, e.g. "coding-agent" or "notebook-agent".
   */
  eventName: string;
  project_id: string;
  /**
   * The file path being edited — used in standalone mode to create
   * a hidden meta file for the agent's own SyncDB.  Optional because
   * notebook agent is always embedded.
   */
  path?: string;
  /**
   * Skip records whose event field matches any of these values.
   * Useful to filter out non-message sentinel records (e.g. "server_state").
   */
  skipEvents?: string[];
  /**
   * How to sort sessions in the session bar.
   * - "earliest" (default): sort by each session's earliest message date
   * - "latest": sort by each session's latest (most recent) message date
   */
  sessionSort?: "earliest" | "latest";
  /**
   * Whether to validate that the current sessionId exists in the
   * loaded sessions before keeping it.  Defaults to true.
   * Set to false to always respect the current sessionId, even if
   * it has no persisted messages yet (e.g. brand-new sessions).
   */
  validateSessionExists?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useAgentSession(options: UseAgentSessionOptions): AgentSession {
  const {
    chatSyncdb,
    existingSyncdb,
    eventName,
    project_id,
    path,
    skipEvents,
    sessionSort = "earliest",
    validateSessionExists = true,
  } = options;

  const usesChatSchema = chatSyncdb != null;
  const usesExistingSyncdb = existingSyncdb != null;

  // ---- Core state ----
  const [syncdb, setSyncdb] = useState<any>(chatSyncdb ?? null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [sessionId, setSessionIdState] = useState<string>("");
  const [allSessions, setAllSessions] = useState<string[]>([]);
  const [sessionNames, setSessionNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [generating, setGeneratingState] = useState(false);
  const generatingRef = useRef(false);
  const setGenerating = useCallback((v: boolean) => {
    generatingRef.current = v;
    setGeneratingState(v);
  }, []);
  const [error, setError] = useState<string>("");

  // ---- Refs for stale-closure avoidance ----
  const sessionIdRef = useRef<string>("");
  const setSessionId = useCallback((id: string) => {
    sessionIdRef.current = id;
    setSessionIdState(id);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const pendingNewSessionRef = useRef<string>("");

  // Ref to always call the latest loadSessionsAndMessages from
  // change handlers, avoiding stale closures in useEffect listeners.
  const loadRef = useRef<(db: any) => void>(() => {});

  // ---- loadSessionsAndMessages ----
  const loadSessionsAndMessages = useCallback(
    (db: any) => {
      if (db?.get_state() !== "ready") return;

      const allRecords = db.get();
      if (allRecords == null) return;

      const currentSessionId = sessionIdRef.current;
      const sessionsSet = new Set<string>();
      const msgsBySession = new Map<string, DisplayMessage[]>();
      const names = new Map<string, string>();

      allRecords.forEach((record: any) => {
        // In embedded chat mode, filter by eventName so other agents'
        // records are excluded.  Skip this filter for existingSyncdb
        // mode (all records belong to this agent).
        if (usesChatSchema && !usesExistingSyncdb) {
          if (record.get("event") !== eventName) return;
        }

        const sid = record.get("session_id");
        if (!sid) return;

        // Always skip session_name records from the message list —
        // their non-ISO date field ("session_name:{sid}") would produce
        // NaN in the date sort and corrupt message ordering.
        const eventField =
          usesChatSchema && !usesExistingSyncdb
            ? record.get("msg_event")
            : record.get("event");
        if (eventField === "session_name") {
          const name = record.get("content");
          if (name) names.set(sid, name);
          return;
        }

        // Skip records whose event matches any entry in skipEvents
        if (skipEvents && skipEvents.includes(eventField)) {
          return;
        }

        sessionsSet.add(sid);

        if (!msgsBySession.has(sid)) {
          msgsBySession.set(sid, []);
        }

        const msg: DisplayMessage = {
          sender: record.get("sender") ?? "user",
          content: record.get("content") ?? "",
          date: record.get("date") ?? "",
          event:
            usesChatSchema && !usesExistingSyncdb
              ? (record.get("msg_event") ?? "message")
              : (record.get("event") ?? "message"),
          account_id: record.get("account_id"),
          base_snapshot: record.get("base_snapshot"),
        };
        msgsBySession.get(sid)!.push(msg);
      });

      setSessionNames(names);

      const sessionInfos = Array.from(sessionsSet)
        .map((sid) => ({
          sessionId: sid,
          earliestDate: (msgsBySession.get(sid) ?? []).reduce(
            (min, msg) => (msg.date < min ? msg.date : min),
            "\uffff",
          ),
        }))
        .sort((a, b) => a.earliestDate.localeCompare(b.earliestDate));
      const sessionsToPrune = getSessionsToPrune(sessionInfos, {
        protectedSessionIds: new Set(
          [currentSessionId, pendingNewSessionRef.current].filter(Boolean),
        ),
      });
      if (sessionsToPrune.length > 0) {
        const pruneSet = new Set(sessionsToPrune);
        allRecords.forEach((record: any) => {
          const sid = record.get("session_id");
          if (!sid || !pruneSet.has(sid)) return;
          if (usesChatSchema && !usesExistingSyncdb) {
            if (record.get("event") !== eventName) return;
            db.delete({
              date: record.get("date"),
              sender_id: record.get("sender_id"),
              event: eventName,
            });
          } else {
            db.delete({
              session_id: sid,
              date: record.get("date"),
            });
          }
        });
        db.commit();
        sessionsToPrune.forEach((sid) => {
          sessionsSet.delete(sid);
          msgsBySession.delete(sid);
          names.delete(sid);
        });
      }

      // Keep pending new sessions visible
      const pendingId = pendingNewSessionRef.current;
      if (pendingId && sessionsSet.has(pendingId)) {
        pendingNewSessionRef.current = "";
      }
      if (pendingId && !sessionsSet.has(pendingId)) {
        sessionsSet.add(pendingId);
      }

      // Sort sessions chronologically.
      let sessions: string[];
      if (sessionSort === "latest") {
        // Sort by most recent message date (newest last)
        sessions = Array.from(sessionsSet).sort((a, b) => {
          const msgsA = msgsBySession.get(a) ?? [];
          const msgsB = msgsBySession.get(b) ?? [];
          const latestA = msgsA.reduce(
            (max, m) => Math.max(max, new Date(m.date).valueOf() || 0),
            0,
          );
          const latestB = msgsB.reduce(
            (max, m) => Math.max(max, new Date(m.date).valueOf() || 0),
            0,
          );
          return latestA - latestB;
        });
      } else {
        // Default: sort by earliest message date
        sessions = Array.from(sessionsSet).sort((a, b) => {
          const aDate = msgsBySession.get(a)?.[0]?.date ?? "\uffff";
          const bDate = msgsBySession.get(b)?.[0]?.date ?? "\uffff";
          return aDate.localeCompare(bDate);
        });
      }
      setAllSessions(sessions);

      // Pick active session.  When validateSessionExists is false, always
      // respect the current sessionId (covers brand-new sessions with no
      // persisted messages yet).
      let activeSession: string;
      if (validateSessionExists) {
        activeSession =
          currentSessionId && sessionsSet.has(currentSessionId)
            ? currentSessionId
            : sessions.length > 0
              ? sessions[sessions.length - 1]
              : "";
      } else {
        activeSession = currentSessionId
          ? currentSessionId
          : sessions.length > 0
            ? sessions[sessions.length - 1]
            : "";
      }

      if (activeSession !== currentSessionId) {
        setSessionId(activeSession);
      }

      if (activeSession) {
        const msgs = msgsBySession.get(activeSession) ?? [];
        msgs.sort(
          (a, b) => new Date(a.date).valueOf() - new Date(b.date).valueOf(),
        );
        setMessages(msgs);
      } else {
        setMessages([]);
      }
    },
    [
      usesChatSchema,
      usesExistingSyncdb,
      eventName,
      skipEvents,
      sessionSort,
      validateSessionExists,
    ],
  );

  // Keep the ref in sync so change handlers always call the latest version.
  loadRef.current = loadSessionsAndMessages;

  // ---- SyncDB initialization: existingSyncdb mode ----
  // Uses a pre-existing SyncDB directly (e.g. the frame editor's _syncstring).
  // No hidden file creation, no chat schema filtering.
  useEffect(() => {
    if (!usesExistingSyncdb || !existingSyncdb) return;

    const handleChange = () => {
      if (existingSyncdb.get_state() === "ready" && !generatingRef.current) {
        loadRef.current(existingSyncdb);
      }
    };

    const handleReady = () => {
      setSyncdb(existingSyncdb);
      loadRef.current(existingSyncdb);
    };

    existingSyncdb.on("change", handleChange);

    if (existingSyncdb.get_state() === "ready") {
      handleReady();
    } else {
      existingSyncdb.once("ready", handleReady);
    }

    return () => {
      existingSyncdb.removeListener("change", handleChange);
      existingSyncdb.removeListener("ready", handleReady);
    };
  }, [existingSyncdb]);

  // ---- SyncDB initialization: standalone mode ----
  useEffect(() => {
    if (usesChatSchema || usesExistingSyncdb || !path) return;

    const syncdbPath = hidden_meta_file(path, eventName);
    redux.getProjectActions(project_id)?.setNotDeleted(syncdbPath);

    const db = webapp_client.sync_client.sync_db({
      project_id,
      path: syncdbPath,
      primary_keys: ["session_id", "date"],
      string_cols: ["content"],
      change_throttle: SYNCDB_CHANGE_THROTTLE,
    });

    const handleReady = () => {
      setSyncdb(db);
      loadRef.current(db);
    };

    const handleChange = () => {
      // Skip during generation — the streaming token handler is
      // managing setMessages directly; a reload would overwrite
      // the in-progress assistant content and cause flickering.
      if (db.get_state() === "ready" && !generatingRef.current) {
        loadRef.current(db);
      }
    };

    db.on("change", handleChange);

    if (db.get_state() === "ready") {
      handleReady();
    } else {
      db.once("ready", handleReady);
    }

    db.once("error", (err: any) => {
      console.warn(`Agent syncdb error (${eventName}): ${err}`);
      setError(`SyncDB error: ${err}`);
    });

    return () => {
      db.removeListener("change", handleChange);
      db.removeListener("ready", handleReady);
      db.close();
    };
  }, [project_id, path, eventName]);

  // ---- SyncDB initialization: embedded mode ----
  useEffect(() => {
    if (usesExistingSyncdb) return;
    if (!usesChatSchema || !chatSyncdb) return;

    const handleChange = () => {
      if (chatSyncdb.get_state() === "ready" && !generatingRef.current) {
        loadRef.current(chatSyncdb);
      }
    };

    const handleReady = () => {
      setSyncdb(chatSyncdb);
      loadRef.current(chatSyncdb);
    };

    chatSyncdb.on("change", handleChange);

    if (chatSyncdb.get_state() === "ready") {
      handleReady();
    } else {
      chatSyncdb.once("ready", handleReady);
    }

    return () => {
      chatSyncdb.removeListener("change", handleChange);
      chatSyncdb.removeListener("ready", handleReady);
    };
  }, [chatSyncdb]);

  // ---- Auto-scroll to bottom ----
  // Scroll only the immediate messages container, not ancestor elements.
  // Using scrollIntoView would propagate to ancestor containers and shift
  // the entire editor frame upward (scroll leak).
  useEffect(() => {
    const el = messagesEndRef.current?.parentElement;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // ---- Reload when sessionId changes ----
  useEffect(() => {
    if (syncdb?.get_state() === "ready") {
      loadSessionsAndMessages(syncdb);
    }
  }, [sessionId, syncdb]);

  // ---- writeMessage ----
  const writeMessage = useCallback(
    (msg: WriteMessageParams) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const sid = msg.session_id || sessionIdRef.current || uuid();

      if (usesExistingSyncdb) {
        // existingSyncdb mode: write directly without date collision
        // avoidance or chat-schema mapping.
        syncdb.set({
          session_id: sid,
          date: msg.date,
          sender: msg.sender,
          content: msg.content,
          account_id: msg.account_id,
          event: msg.msg_event,
          base_snapshot: msg.base_snapshot,
        });
      } else if (usesChatSchema) {
        syncdb.set({
          date: msg.date,
          sender_id:
            msg.sender === "user"
              ? (msg.account_id ?? "unknown")
              : agentSenderId(eventName, msg.sender),
          event: eventName,
          session_id: sid,
          content: msg.content,
          sender: msg.sender,
          msg_event: msg.msg_event,
          account_id: msg.account_id,
          base_snapshot: msg.base_snapshot,
        });
      } else {
        // Standalone mode: ensure unique dates — if two writes land in
        // the same ms, bump the timestamp by 1ms so the primary key is
        // unique and the date remains a valid, sortable ISO string.
        let dateStr = msg.date;
        if (dateStr <= lastStandaloneDate) {
          const bumped = new Date(new Date(lastStandaloneDate).valueOf() + 1);
          dateStr = bumped.toISOString();
        }
        lastStandaloneDate = dateStr;
        syncdb.set({
          session_id: sid,
          date: dateStr,
          sender: msg.sender,
          content: msg.content,
          account_id: msg.account_id,
          event: msg.msg_event,
          base_snapshot: msg.base_snapshot,
        });
      }
      syncdb.commit();
    },
    [syncdb, eventName, usesChatSchema, usesExistingSyncdb],
  );

  // ---- handleNewSession ----
  const handleNewSession = useCallback(() => {
    const newId = uuid();
    pendingNewSessionRef.current = newId;
    setSessionId(newId);
    setMessages([]);
    setError("");
  }, []);

  // ---- handleClearSession ----
  // Deletes all records for the current session, then switches to the
  // most recent remaining session (or creates a fresh one).
  const handleClearSession = useCallback(() => {
    if (!syncdb || !sessionIdRef.current) return;
    const sid = sessionIdRef.current;
    const allRecords = syncdb.get();
    if (allRecords != null) {
      allRecords.forEach((record: any) => {
        if (usesChatSchema && !usesExistingSyncdb) {
          if (
            record.get("event") === eventName &&
            record.get("session_id") === sid
          ) {
            syncdb.delete({
              date: record.get("date"),
              sender_id: record.get("sender_id"),
              event: eventName,
            });
          }
        } else {
          if (record.get("session_id") === sid) {
            syncdb.delete({
              session_id: sid,
              date: record.get("date"),
            });
          }
        }
      });
      syncdb.commit();
    }
    // Switch away from the now-empty session
    const remaining = allSessions.filter((s) => s !== sid);
    if (remaining.length > 0) {
      setSessionId(remaining[remaining.length - 1]);
    } else {
      // No sessions left — start fresh
      const newId = uuid();
      pendingNewSessionRef.current = newId;
      setSessionId(newId);
    }
    setMessages([]);
    setError("");
  }, [syncdb, eventName, usesChatSchema, usesExistingSyncdb, allSessions]);

  // ---- writeSessionName ----
  const writeSessionName = useCallback(
    (name: string, sid?: string) => {
      if (!syncdb || syncdb.get_state() !== "ready") return;
      const targetSid = sid || sessionIdRef.current;
      if (!targetSid) return;

      const date = `session_name:${targetSid}`;
      if (usesChatSchema && !usesExistingSyncdb) {
        syncdb.set({
          date,
          sender_id: agentSenderId(eventName, "system"),
          event: eventName,
          session_id: targetSid,
          content: name,
          sender: "system",
          msg_event: "session_name",
        });
      } else {
        syncdb.set({
          session_id: targetSid,
          date,
          sender: "system",
          content: name,
          event: "session_name",
        });
      }
      syncdb.commit();
      setSessionNames((prev) => new Map(prev).set(targetSid, name));
    },
    [syncdb, eventName, usesChatSchema, usesExistingSyncdb],
  );

  return {
    syncdb,
    messages,
    sessionId: sessionIdRef.current,
    allSessions,
    sessionNames,
    generating,
    error,
    setGenerating,
    setError,
    setMessages,
    writeMessage,
    handleNewSession,
    handleClearSession,
    writeSessionName,
    setSessionId,
    messagesEndRef,
    cancelRef,
    generatingRef,
    sessionIdRef,
    pendingNewSessionRef,
  };
}
