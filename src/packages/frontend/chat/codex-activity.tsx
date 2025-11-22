import { Button, Card, Space, Tag, Typography } from "antd";
import {
  React,
  useEffect,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import {
  DiffMatchPatch,
  decompressPatch,
  type CompressedPatch,
} from "@cocalc/util/dmp";
import { COLORS } from "@cocalc/util/theme";
import type {
  AcpStreamEvent,
  AcpStreamMessage,
} from "@cocalc/conat/ai/acp/types";
import { plural } from "@cocalc/util/misc";

const { Text } = Typography;
const diffPrinter = new DiffMatchPatch();

type ActivityEntry =
  | {
      kind: "reasoning";
      id: string;
      seq: number;
      text?: string;
    }
  | {
      kind: "agent";
      id: string;
      seq: number;
      text?: string;
    }
  | {
      kind: "status";
      id: string;
      seq: number;
      label: string;
      detail?: string;
      level?: "info" | "error";
    }
  | {
      kind: "diff";
      id: string;
      seq: number;
      path: string;
      patch: CompressedPatch;
    };

export interface CodexActivityProps {
  events?: AcpStreamMessage[];
  threadId?: string | null;
  generating?: boolean;
}

export function CodexActivity({
  events,
  threadId,
  generating,
}: CodexActivityProps): React.ReactElement | null {
  const entries = useMemo(() => normalizeEvents(events ?? []), [events]);
  const [expanded, setExpanded] = useState<boolean>(!!generating);

  useEffect(() => {
    if (generating) {
      setExpanded(true);
    }
  }, [generating]);

  if (!entries.length) return null;

  const header = (
    <Space size={6} align="center" wrap>
      {expanded && (
        <>
          <Text strong style={{ color: COLORS.GRAY }}>
            Activity
          </Text>
          {threadId ? (
            <Tag color="blue" style={{ margin: 0 }}>
              {threadId}
            </Tag>
          ) : null}
        </>
      )}
      <Button size="small" type="link" onClick={() => setExpanded((v) => !v)}>
        {expanded
          ? "Hide log"
          : `Show log (${entries.length} ${plural(entries.length, "step")})`}
      </Button>
    </Space>
  );

  if (!expanded) {
    return (
      <Card
        size="small"
        style={{
          marginTop: 8,
          background: COLORS.GRAY_LL,
          borderColor: COLORS.GRAY_L,
        }}
        bodyStyle={{ padding: "6px 10px" }}
      >
        {header}
      </Card>
    );
  }

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
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {header}
        {entries.map((entry) => (
          <ActivityRow key={entry.id} entry={entry} />
        ))}
      </Space>
    </Card>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  switch (entry.kind) {
    case "reasoning":
      return (
        <div>
          <Tag color="purple" style={{ marginBottom: 4 }}>
            Reasoning
          </Tag>
          {entry.text ? (
            <StaticMarkdown
              value={entry.text}
              style={{ fontSize: 13, marginTop: 4 }}
            />
          ) : (
            <Text type="secondary">…</Text>
          )}
        </div>
      );
    case "agent":
      return (
        <div>
          <Tag color="cyan" style={{ marginBottom: 4 }}>
            Agent
          </Tag>
          {entry.text ? (
            <StaticMarkdown
              value={entry.text}
              style={{ fontSize: 13, marginTop: 4 }}
            />
          ) : (
            <Text type="secondary">…</Text>
          )}
        </div>
      );
    case "diff":
      return (
        <div>
          <Tag color="geekblue" style={{ marginBottom: 4 }}>
            Diff
          </Tag>
          <Text strong>{entry.path}</Text>
          <pre
            style={{
              background: "white",
              color: "#333",
              padding: "8px",
              borderRadius: 4,
              marginTop: 6,
              whiteSpace: "pre-wrap",
            }}
          >
            {patchToText(entry.patch)}
          </pre>
        </div>
      );
    case "status":
    default:
      return (
        <Space size={6} align="center">
          <Tag color={entry.level === "error" ? "red" : "default"}>
            {entry.label}
          </Tag>
          {entry.detail ? (
            <Text type={entry.level === "error" ? "danger" : "secondary"}>
              {entry.detail}
            </Text>
          ) : null}
        </Space>
      );
  }
}

function normalizeEvents(events: AcpStreamMessage[]): ActivityEntry[] {
  const rows: ActivityEntry[] = [];
  let fallbackId = 0;
  for (const message of events) {
    const seq = message.seq ?? ++fallbackId;
    if (message.type === "error") {
      rows.push({
        kind: "status",
        id: `error-${seq}`,
        seq,
        label: "Error",
        detail: formatErrorDetail(message.error),
        level: "error",
      });
      continue;
    }
    if (message.type === "summary") {
      rows.push({
        kind: "status",
        id: `summary-${seq}`,
        seq,
        label: "Summary",
        detail: formatSummaryDetail(message),
      });
      continue;
    }
    if (
      message.type === "event" &&
      "event" in message &&
      message.event != null
    ) {
      rows.push(createEventEntry(message.event, seq));
    }
  }
  return rows.sort((a, b) => a.seq - b.seq);
}

function createEventEntry(event: AcpStreamEvent, seq: number): ActivityEntry {
  if (event?.type === "diff") {
    return {
      kind: "diff",
      id: `diff-${seq}`,
      seq,
      path: stringifyPath(event.path),
      patch: normalizePatch(event.patch),
    };
  }
  if (event?.type === "thinking") {
    return {
      kind: "reasoning",
      id: `thinking-${seq}`,
      seq,
      text: event.text ?? "",
    };
  }
  return {
    kind: "agent",
    id: `agent-${seq}`,
    seq,
    text: eventHasText(event) ? (event.text ?? "") : "",
  };
}

function formatSummaryDetail(message: AcpStreamMessage & { type: "summary" }) {
  const parts: string[] = [];
  if (message.finalResponse) {
    parts.push(truncate(message.finalResponse, 200));
  }
  if (message.usage) {
    parts.push(`Usage: ${formatUsage(message.usage)}`);
  }
  return parts.join(" · ");
}

function formatUsage(usage?: {
  input_tokens?: number;
  output_tokens?: number;
}) {
  if (!usage) return "";
  const parts: string[] = [];
  if (usage.input_tokens != null) parts.push(`${usage.input_tokens} in`);
  if (usage.output_tokens != null) parts.push(`${usage.output_tokens} out`);
  return parts.join(", ");
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatErrorDetail(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error == null) return "Unknown error";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function patchToText(patch: CompressedPatch): string {
  try {
    return diffPrinter.patch_toText([decompressPatch(normalizePatch(patch))]);
  } catch (err) {
    return `Failed to render diff: ${err}`;
  }
}

function eventHasText(
  event?: AcpStreamEvent,
): event is Extract<AcpStreamEvent, { text: string }> {
  return event?.type === "thinking" || event?.type === "message";
}

function normalizePatch(patch: any): CompressedPatch {
  if (patch == null) return [];
  if (typeof patch.toJS === "function") {
    return patch.toJS();
  }
  return patch as CompressedPatch;
}

function stringifyPath(pathValue: any): string {
  if (typeof pathValue === "string") return pathValue;
  if (pathValue == null) return "";
  if (typeof pathValue.toString === "function") {
    return pathValue.toString();
  }
  try {
    return JSON.stringify(pathValue);
  } catch {
    return String(pathValue);
  }
}

export default CodexActivity;
