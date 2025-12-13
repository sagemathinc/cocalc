import CodexActivity from "./codex-activity";

interface Props {
  events?: any[];
  generating?: boolean;
  fontSize?: number;
  persistKey: string;
  basePath?: string;
  durationLabel?: string;
  canResolveApproval?: boolean;
  onResolveApproval?: (args: { approvalId: string; optionId?: string }) => any;
  projectId?: string;
  onDeleteEvents?: () => void;
  onDeleteAllEvents?: () => void;
}

export function CodexLogPanel({
  events,
  generating,
  fontSize,
  persistKey,
  basePath,
  durationLabel,
  canResolveApproval,
  onResolveApproval,
  projectId,
  onDeleteEvents,
  onDeleteAllEvents,
}: Props) {
  const activityEvents =
    events && events.length > 0
      ? events
      : generating
        ? [
            {
              type: "event",
              event: { type: "thinking", text: "" },
              seq: 0,
            },
          ]
        : [];

  return (
    <CodexActivity
      expanded
      events={activityEvents}
      generating={generating === true}
      fontSize={fontSize}
      persistKey={persistKey}
      basePath={basePath}
      durationLabel={durationLabel}
      canResolveApproval={canResolveApproval}
      onResolveApproval={onResolveApproval}
      projectId={projectId}
      onDeleteEvents={onDeleteEvents}
      onDeleteAllEvents={onDeleteAllEvents}
    />
  );
}

export default CodexLogPanel;
