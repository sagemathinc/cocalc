import { useEffect, useMemo, useRef } from "react";
import type { AcpStreamMessage } from "@cocalc/conat/ai/acp/types";
import CodexActivity from "./codex-activity";
import {
  deleteActivityLog,
  deleteAllActivityLogs,
  type ActivityLogContext,
} from "./actions/activity-logs";
import { useCodexLog } from "./use-codex-log";

interface Props {
  generating?: boolean;
  fontSize?: number;
  persistKey: string;
  basePath?: string;
  durationLabel?: string;
  projectId?: string;
  logStore?: string;
  logKey?: string;
  logSubject?: string;
  logProjectId?: string;
  logEnabled?: boolean;
  activityContext?: ActivityLogContext;
  onEventsChange?: (eventCount: number) => void;
  onDeleteEvents?: () => void;
  onDeleteAllEvents?: () => void;
}

export function CodexLogPanel({
  generating,
  fontSize,
  persistKey,
  basePath,
  durationLabel,
  projectId,
  logStore,
  logKey,
  logSubject,
  logProjectId,
  logEnabled,
  activityContext,
  onEventsChange,
  onDeleteEvents,
  onDeleteAllEvents,
}: Props) {
  const codexLog = useCodexLog({
    projectId: logProjectId,
    logStore,
    logKey,
    logSubject,
    generating: generating === true,
    enabled: logEnabled,
  });

  const activityEvents: AcpStreamMessage[] =
    (codexLog.events ?? []).length > 0
      ? codexLog.events!
      : generating
        ? [
            {
              type: "event",
              event: { type: "thinking", text: "" },
              seq: 0,
            },
          ]
        : [];
  const lastEmittedCount = useRef<number | null>(null);
  useEffect(() => {
    if (!onEventsChange) return;
    if (lastEmittedCount.current === activityEvents.length) return;
    lastEmittedCount.current = activityEvents.length;
    onEventsChange(activityEvents.length);
  }, [activityEvents.length, onEventsChange]);

  const handleDeleteEvents = useMemo(() => {
    if (onDeleteEvents) return onDeleteEvents;
    if (!activityContext) return undefined;
    return async () => {
      await deleteActivityLog({
        actions: activityContext.actions,
        message: activityContext.message,
        deleteLog: codexLog.deleteLog,
      });
    };
  }, [onDeleteEvents, activityContext, codexLog.deleteLog]);

  const handleDeleteAllEvents = useMemo(() => {
    if (onDeleteAllEvents) return onDeleteAllEvents;
    if (!activityContext) return undefined;
    return async () => {
      await deleteAllActivityLogs(activityContext);
    };
  }, [onDeleteAllEvents, activityContext]);

  return (
    <CodexActivity
      expanded
      events={activityEvents}
      generating={generating === true}
      fontSize={fontSize}
      persistKey={persistKey}
      basePath={basePath}
      durationLabel={durationLabel}
      projectId={projectId}
      onDeleteEvents={handleDeleteEvents}
      onDeleteAllEvents={handleDeleteAllEvents}
    />
  );
}

export default CodexLogPanel;
