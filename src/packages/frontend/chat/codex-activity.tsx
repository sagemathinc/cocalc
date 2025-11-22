import { Button, Card, Space, Tag, Typography } from "antd";
import {
  React,
  useEffect,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import Terminal from "@cocalc/frontend/components/terminal";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";
import type { AcpStreamMessage } from "@cocalc/conat/ai/acp/types";
import { plural } from "@cocalc/util/misc";

const { Text } = Typography;
const MAX_COMMAND_OUTPUT = 10_000;

type LegacyUsage = {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
};

type LegacyEventError = { message?: string };

type LegacyThreadItem = {
  id?: string;
  type?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number;
  status?: string;
  text?: string;
  changes?: { path?: string; kind?: string }[];
};

type LegacyEvent = {
  type?: string;
  thread_id?: string;
  usage?: LegacyUsage;
  error?: LegacyEventError;
  message?: string;
  item?: LegacyThreadItem;
  [key: string]: any;
};

type CodexStreamMessage =
  | {
      seq?: number;
      type: "event";
      event?: LegacyEvent;
    }
  | {
      seq?: number;
      type: "summary";
      finalResponse?: string;
      usage?: LegacyUsage | null;
      threadId?: string | null;
    }
  | {
      seq?: number;
      type: "error";
      error: string;
    };

type AgentMessageItem = {
  id?: string;
  type: "agent_message";
  text?: string;
};

type ThreadItem = LegacyThreadItem;

type ActivityMessage = CodexStreamMessage | AcpStreamMessage;
type SimpleAcpEvent =
  | { type: "thinking"; text?: string }
  | { type: "message"; text?: string };

export interface CodexActivityProps {
  events?: ActivityMessage[];
  threadId?: string | null;
  generating?: boolean;
}

type CommandEntry = Extract<ActivityEntry, { kind: "command" }>;
type ReasoningEntry = Extract<ActivityEntry, { kind: "reasoning" }>;
type AgentEntry = Extract<ActivityEntry, { kind: "agent" }>;
type FileChangeEntry = Extract<ActivityEntry, { kind: "file_change" }>;

type ActivityEntry =
  | {
      kind: "reasoning";
      id: string;
      seq: number;
      text?: string;
    }
  | {
      kind: "command";
      id: string;
      seq: number;
      command?: string;
      output?: string;
      status?: string;
      exitCode?: number | null;
    }
  | {
      kind: "agent";
      id: string;
      seq: number;
      text?: string;
    }
  | {
      kind: "file_change";
      id: string;
      seq: number;
      status?: string;
      changes: { path?: string; kind?: string }[];
    }
  | {
      kind: "status";
      id: string;
      seq: number;
      label: string;
      detail?: string;
      level?: "info" | "error";
    };

export function CodexActivity({
  events,
  threadId,
  generating,
}: CodexActivityProps): React.ReactElement | null {
  const entries = useMemo(() => normalizeEvents(events ?? []), [events]);

  const [expanded, setExpanded] = useState<boolean>(generating ? true : false);

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
    case "command": {
      const cmdLabel = entry.command?.trim() ? entry.command.trim() : "command";
      const terminalText = formatTerminalText(entry);
      return (
        <div>
          <Space align="baseline" size={6}>
            <Tag color="geekblue">Command</Tag>
            <Text code style={{ fontSize: 12 }}>
              {truncate(cmdLabel, 120)}
            </Text>
            {entry.status ? (
              <Tag color={entry.exitCode === 0 ? "green" : "red"}>
                {entry.status}
                {entry.exitCode != null ? ` · exit ${entry.exitCode}` : ""}
              </Tag>
            ) : null}
          </Space>
          <Terminal
            value={terminalText}
            width={100}
            height={estimateHeight(terminalText)}
            scrollback={2000}
            style={{ marginTop: 4 }}
          />
        </div>
      );
    }
    case "status":
    case "file_change":
    default:
      return entry.kind === "file_change" ? (
        <div>
          <pre>{JSON.stringify(entry.changes, undefined, 2)}</pre>
          <Space size={6} align="baseline">
            <Tag color="orange">Files</Tag>
            {entry.status ? <Tag>{entry.status}</Tag> : null}
          </Space>
          <pre
            style={{
              background: COLORS.GRAY_L,
              padding: "6px 8px",
              borderRadius: 4,
              marginTop: 6,
              fontSize: 12,
              overflowX: "auto",
            }}
          >
            {entry.changes.map((change, idx) => {
              const { prefix, color } = formatFileDiffLine(change.kind);
              return (
                <div key={idx} style={{ color }}>
                  {prefix}
                  {change.path ?? ""}
                </div>
              );
            })}
          </pre>
        </div>
      ) : (
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

function normalizeEvents(events: ActivityMessage[]): ActivityEntry[] {
  const map = new Map<string, ActivityEntry>();
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
        detail: message.error,
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
        detail: truncate(message.finalResponse ?? "", 200),
      });
      continue;
    }
    const event = message.event;
    if (!event) continue;
    if (event.type === "thinking" || event.type === "message") {
      rows.push(createAcpEntry(event as SimpleAcpEvent, seq));
      continue;
    }
    switch (event.type) {
      case "thread.started":
        rows.push({
          kind: "status",
          id: `thread-${seq}`,
          seq,
          label: "Thread started",
          detail: event.thread_id,
        });
        break;
      case "turn.started":
        rows.push({
          kind: "status",
          id: `turn-start-${seq}`,
          seq,
          label: "Turn started",
        });
        break;
      case "turn.completed":
        rows.push({
          kind: "status",
          id: `turn-complete-${seq}`,
          seq,
          label: "Turn completed",
          detail: formatUsage(event.usage),
        });
        break;
      case "turn.failed":
        rows.push({
          kind: "status",
          id: `turn-failed-${seq}`,
          seq,
          label: "Turn failed",
          detail: event.error?.message,
          level: "error",
        });
        break;
      case "error":
        rows.push({
          kind: "status",
          id: `event-error-${seq}`,
          seq,
          label: "Error",
          detail: event.message,
          level: "error",
        });
        break;
      case "item.started":
      case "item.updated":
      case "item.completed": {
        const item = (event.item ?? {}) as ThreadItem;
        const key = item.id ?? `${item.type ?? "item"}-${seq}`;
        if (isCommandExecutionItem(item)) {
          const existing = getOrCreate<CommandEntry>(map, key, {
            kind: "command",
            id: key,
            seq,
            command: item.command ?? "",
            output: clipCommandOutput(item.aggregated_output ?? ""),
          });
          existing.seq = seq;
          existing.command = item.command ?? existing.command;
          if (item.aggregated_output != null) {
            existing.output = clipCommandOutput(item.aggregated_output);
          }
          if ("exit_code" in item) {
            existing.exitCode = item.exit_code;
          }
          existing.status = item.status ?? existing.status;
          if (!rows.includes(existing)) {
            rows.push(existing);
          }
        } else if (isReasoningItem(item)) {
          const existing = getOrCreate<ReasoningEntry>(map, key, {
            kind: "reasoning",
            id: key,
            seq,
            text: item.text ?? "",
          });
          existing.seq = seq;
          existing.text = item.text ?? existing.text;
          if (!rows.includes(existing)) {
            rows.push(existing);
          }
        } else if (isAgentMessageItem(item)) {
          const existing = getOrCreate<AgentEntry>(map, key, {
            kind: "agent",
            id: key,
            seq,
            text: item.text ?? "",
          });
          existing.seq = seq;
          existing.text = item.text ?? existing.text;
          if (!rows.includes(existing)) {
            rows.push(existing);
          }
        } else if (isFileChangeItem(item)) {
          const existing = getOrCreate<FileChangeEntry>(map, key, {
            kind: "file_change",
            id: key,
            seq,
            status: item.status,
            changes: normalizeFileChanges(item.changes),
          });
          existing.seq = seq;
          existing.status = item.status ?? existing.status;
          existing.changes = normalizeFileChanges(item.changes);
          if (!rows.includes(existing)) {
            rows.push(existing);
          }
        } else {
          rows.push({
            kind: "status",
            id: `${key}`,
            seq,
            label: item.type ?? "item",
            detail: JSON.stringify(item),
          });
        }
        break;
      }
      default:
        break;
    }
  }
  rows.sort((a, b) => a.seq - b.seq);
  return rows;
}

function createAcpEntry(event: SimpleAcpEvent, seq: number): ActivityEntry {
  if (event.type === "thinking") {
    return {
      kind: "reasoning",
      id: `acp-thinking-${seq}`,
      seq,
      text: event.text,
    };
  }
  return {
    kind: "agent",
    id: `acp-message-${seq}`,
    seq,
    text: event.text,
  };
}

function getOrCreate<T extends ActivityEntry>(
  map: Map<string, ActivityEntry>,
  key: string,
  initial: T,
): T {
  const current = map.get(key);
  if (current) {
    return current as T;
  }
  map.set(key, initial);
  return initial;
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatTerminalText(
  entry: Extract<ActivityEntry, { kind: "command" }>,
) {
  const command = entry.command ? `$ ${entry.command.trim()}` : "$";
  const output = entry.output ?? "";
  const exit =
    entry.exitCode != null
      ? `\n\nexit ${entry.exitCode}${entry.status ? ` (${entry.status})` : ""}`
      : entry.status
        ? `\n\n${entry.status}`
        : "";
  return convertTerminalNewlines(`${command}\n${output}${exit}`);
}

function estimateHeight(text: string): number {
  const lines = text.split(/\r?\n/).length + 2;
  return Math.min(40, Math.max(6, lines));
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

function clipCommandOutput(value: string): string {
  if (!value) return "";
  if (value.length <= MAX_COMMAND_OUTPUT) return value;
  return `${value.slice(0, MAX_COMMAND_OUTPUT)}\n… (truncated)`;
}

function convertTerminalNewlines(value: string): string {
  return value.replace(/\n/g, "\r\n");
}

function formatFileDiffLine(kind?: string): { prefix: string; color: string } {
  const normalized = kind?.toLowerCase();
  if (
    normalized === "create" ||
    normalized === "add" ||
    normalized === "insert"
  ) {
    return { prefix: "+ ", color: "#2e7d32" };
  }
  if (normalized === "delete" || normalized === "remove") {
    return { prefix: "- ", color: "#c62828" };
  }
  return { prefix: "· ", color: COLORS.GRAY_D };
}

type CommandExecutionItem = {
  id?: string;
  type: "command_execution";
  command?: string;
  aggregated_output?: string;
  exit_code?: number;
  status?: string;
};

type ReasoningItem = {
  id?: string;
  type: "reasoning";
  text?: string;
};

type FileChangeItem = {
  id?: string;
  type: "file_change";
  status?: string;
  changes?: { path?: string; kind?: string }[];
};

function isCommandExecutionItem(
  item: ThreadItem,
): item is CommandExecutionItem {
  return isRecord(item) && item.type === "command_execution";
}

function isReasoningItem(item: ThreadItem): item is ReasoningItem {
  return isRecord(item) && item.type === "reasoning";
}

function isAgentMessageItem(item: ThreadItem): item is AgentMessageItem {
  return isRecord(item) && item.type === "agent_message";
}

function isFileChangeItem(item: ThreadItem): item is FileChangeItem {
  return isRecord(item) && item.type === "file_change";
}

function isRecord(value: any): value is Record<string, any> {
  return value != null && typeof value === "object";
}

function normalizeFileChanges(
  changes: FileChangeItem["changes"],
): { path?: string; kind?: string }[] {
  if (!Array.isArray(changes)) return [];
  return changes.map((change) => ({
    path: change?.path,
    kind: change?.kind,
  }));
}

export default CodexActivity;
