import { Card, Space, Tag, Typography } from "antd";
import { React } from "@cocalc/frontend/app-framework";
import { CodexStreamMessage } from "@cocalc/conat/codex/types";
import { COLORS } from "@cocalc/util/theme";

const { Text } = Typography;

export interface CodexEventsProps {
  events?: CodexStreamMessage[];
  threadId?: string | null;
}

export function CodexEvents({
  events,
  threadId,
}: CodexEventsProps): React.ReactElement | null {
  if (!events || events.length === 0) return null;

  return (
    <Card
      size="small"
      style={{
        marginTop: 8,
        background: COLORS.GRAY_LL,
        borderColor: COLORS.GRAY_L,
      }}
      bodyStyle={{ padding: "8px 10px" }}
    >
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <Text strong style={{ color: COLORS.GRAY }}>
          Codex activity{threadId ? ` · ${threadId}` : ""}
        </Text>
        {events.map((event, idx) => (
          <EventRow key={event.seq ?? idx} event={event} />
        ))}
      </Space>
    </Card>
  );
}

function EventRow({ event }: { event: CodexStreamMessage }) {
  const label = renderLabel(event);
  const detail = renderDetail(event);
  return (
    <Space align="start" size={6} style={{ width: "100%" }}>
      <Tag color="blue" style={{ marginTop: 2 }}>
        {label}
      </Tag>
      <Text style={{ fontSize: 12, color: COLORS.GRAY_D }}>
        {detail ?? "…"}
      </Text>
    </Space>
  );
}

function renderLabel(event: CodexStreamMessage): string {
  if (event.type === "event") {
    const inner = event.event;
    const t = inner?.type ?? "event";
    if (hasItem(inner) && inner.item?.type === "agent_message") {
      return "agent";
    }
    return t;
  }
  if (event.type === "summary") return "summary";
  if (event.type === "error") return "error";
  return "event";
}

function renderDetail(event: CodexStreamMessage): string | undefined {
  if (event.type === "error") return event.error;
  if (event.type === "summary") {
    return truncate(event.finalResponse ?? "", 160);
  }
  if (event.type === "event") {
    const { event: inner } = event;
    if (!inner) return;
    if (inner.type === "thread.started") {
      return `thread ${inner.thread_id ?? ""}`.trim();
    }
    if (inner.type === "turn.completed" && inner.usage) {
      return `usage in ${formatUsage(inner.usage)}`;
    }
    if (inner.type === "error" && inner.message) {
      return inner.message;
    }
    if (hasItem(inner)) {
      const item = inner.item;
      if (item?.type === "agent_message" && item.text) {
        return truncate(item.text, 160);
      }
    }
    return inner.type;
  }
  return;
}

function formatUsage(usage: any): string {
  const parts: string[] = [];
  if (usage.input_tokens != null) parts.push(`${usage.input_tokens} in`);
  if (usage.output_tokens != null) parts.push(`${usage.output_tokens} out`);
  if (usage.cached_input_tokens != null)
    parts.push(`${usage.cached_input_tokens} cached`);
  return parts.join(", ");
}

function truncate(text: string, n: number): string {
  if (text.length <= n) return text;
  return `${text.slice(0, n - 1)}…`;
}

function hasItem(event: any): event is { type: string; item: any } {
  return event != null && typeof event === "object" && "item" in event;
}

export default CodexEvents;
