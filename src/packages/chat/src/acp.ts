import type {
  AcpStreamEvent,
  AcpStreamMessage,
} from "@cocalc/conat/ai/acp/types";
import type {
  CodexSessionMode,
  CodexReasoningLevel,
} from "@cocalc/util/ai/codex";

// Configuration stored on the chat thread root for Codex/ACP turns.
// This is persisted as `acp_config` on the root message.
export interface CodexThreadConfig {
  sessionId?: string; // Codex session/thread id (UUID string)
  model?: string;
  reasoning?: CodexReasoningLevel["id"];
  workingDirectory?: string;
  envHome?: string;
  envPath?: string;
  sessionMode?: CodexSessionMode;
  allowWrite?: boolean;
  codexPathOverride?: string;
}

export function appendStreamMessage(
  events: AcpStreamMessage[],
  message: AcpStreamMessage,
): AcpStreamMessage[] {
  if (message.type !== "event") {
    return [...events, message];
  }
  const last = events[events.length - 1];
  const nextEvent = message.event;
  if (
    last?.type === "event" &&
    eventHasText(last.event) &&
    eventHasText(nextEvent) &&
    last.event.type === nextEvent.type
  ) {
    const merged: AcpStreamMessage = {
      ...last,
      event: {
        ...last.event,
        text: last.event.text + nextEvent.text,
      },
      seq: message.seq ?? last.seq,
    };
    return [...events.slice(0, -1), merged];
  }
  if (message.type === "event" && isApprovalEvent(message.event)) {
    const approvalEvent = message.event;
    const idx = events.findIndex(
      (evt) =>
        evt.type === "event" &&
        isApprovalEvent(evt.event) &&
        evt.event.approvalId === approvalEvent.approvalId,
    );
    if (idx >= 0) {
      const updated = [...events];
      updated[idx] = message;
      return updated;
    }
  }
  return [...events, message];
}

export function extractEventText(
  event?: AcpStreamEvent,
): string | undefined {
  if (!eventHasText(event)) return;
  return event.text;
}

export function eventHasText(
  event?: AcpStreamEvent,
): event is Extract<AcpStreamEvent, { text: string }> {
  return event?.type === "thinking" || event?.type === "message";
}

function isApprovalEvent(
  event?: AcpStreamEvent,
): event is Extract<AcpStreamEvent, { type: "approval" }> {
  return event?.type === "approval";
}
