import { Button, Card, Space, Tag, Typography, message } from "antd";

import type {
  AcpStreamEvent,
  AcpStreamMessage,
  AcpApprovalStatus,
  AcpApprovalOptionKind,
} from "@cocalc/conat/ai/acp/types";
import {
  React,
  redux,
  useEffect,
  useMemo,
  useState,
} from "@cocalc/frontend/app-framework";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import Ansi from "@cocalc/frontend/components/ansi-to-react";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import {
  DiffMatchPatch,
  decompressPatch,
  type CompressedPatch,
} from "@cocalc/util/dmp";
import { plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

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
    }
  | {
      kind: "terminal";
      id: string;
      seq: number;
      terminalId: string;
      command?: string;
      args?: string[];
      cwd?: string;
      output: string;
      truncated?: boolean;
      exitStatus?: {
        exitCode?: number;
        signal?: string;
      };
    }
  | {
      kind: "file";
      id: string;
      seq: number;
      path: string;
      operation: "read" | "write";
      bytes?: number;
      truncated?: boolean;
      line?: number;
      limit?: number;
      existed?: boolean;
    }
  | {
      kind: "approval";
      id: string;
      seq: number;
      approvalId: string;
      title?: string | null;
      description?: string | null;
      status: AcpApprovalStatus;
      options: ApprovalOption[];
      selectedOptionId?: string | null;
      decidedAt?: string;
      decidedBy?: string;
      timeoutAt?: string;
    };

type ApprovalOption = {
  optionId: string;
  name: string;
  kind: AcpApprovalOptionKind;
};

export interface CodexActivityProps {
  events?: AcpStreamMessage[];
  generating?: boolean;
  fontSize?: number;
  durationLabel?: string;
  persistKey?: string;
  canResolveApproval?: boolean;
  onResolveApproval?: (args: {
    approvalId: string;
    optionId?: string;
  }) => Promise<void> | void;
  projectId?: string;
  basePath?: string;
}

// Persist log visibility per chat message so Virtuoso remounts don’t reset it.
const expandedState = new Map<string, boolean>();

export function CodexActivity({
  events,
  generating,
  fontSize,
  durationLabel,
  persistKey,
  canResolveApproval,
  onResolveApproval,
  projectId,
  basePath,
}: CodexActivityProps): React.ReactElement | null {
  const entries = useMemo(() => normalizeEvents(events ?? []), [events]);
  const hasPendingApproval = useMemo(
    () => entries.some((e) => e.kind === "approval" && e.status === "pending"),
    [entries],
  );
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (persistKey) {
      const persisted = expandedState.get(persistKey);
      if (persisted != null) return persisted;
    }
    // Default closed unless generating or an approval is pending.
    return hasPendingApproval;
  });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!persistKey) return;
    expandedState.set(persistKey, expanded);
  }, [persistKey, expanded]);

  useEffect(() => {
    if (!persistKey) return;
    const persisted = expandedState.get(persistKey);
    const next =
      persisted ?? (generating || hasPendingApproval ? true : expanded);
    if (next !== expanded) {
      setExpanded(next);
    }
  }, [persistKey, generating, hasPendingApproval]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entries.length) return null;

  const baseFontSize = fontSize ?? 13;
  const secondarySize = Math.max(11, baseFontSize - 2);
  const durationSummary =
    durationLabel && durationLabel.trim().length > 0
      ? `Worked for ${durationLabel}`
      : `${entries.length} ${plural(entries.length, "step")}`;
  const toggleLabel = expanded ? "Hide log" : `${durationSummary} (show)`;

  if (!expanded) {
    return (
      <div style={{ marginTop: 8, marginLeft: -8, marginBottom: 8 }}>
        <Button size="small" type="text" onClick={() => setExpanded(true)}>
          {toggleLabel}
        </Button>
      </div>
    );
  }

  const showCloseButton = IS_TOUCH || hovered;

  const renderCloseButton = (style?: React.CSSProperties) => (
    <Button
      size="small"
      type="text"
      aria-label="Hide log"
      className="codex-activity-close"
      onClick={() => setExpanded(false)}
      style={{
        fontSize: "16pt",
        color: "#434343",
        opacity: showCloseButton ? 1 : 0,
        transition: "opacity 150ms ease",
        ...style,
      }}
    >
      ×
    </Button>
  );

  const header = (
    <div
      className="codex-activity-header"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <Space
        size={6}
        align="center"
        wrap
        style={{ cursor: "pointer" }}
        onClick={() => setExpanded(false)}
      >
        <Text strong style={{ color: COLORS.GRAY_D, fontSize: baseFontSize }}>
          Activity
        </Text>
        {durationLabel ? (
          <Text type="secondary" style={{ fontSize: secondarySize }}>
            Worked for {durationLabel}
          </Text>
        ) : null}
      </Space>
      {renderCloseButton()}
    </div>
  );

  return (
    <Card
      size="small"
      style={{
        marginTop: 8,
        marginBottom: 8,
        background: "white",
        borderColor: COLORS.GRAY_L,
        boxShadow: "none",
        position: "relative",
      }}
      bodyStyle={{ padding: "8px 10px", fontSize: baseFontSize }}
      onMouseEnter={() => {
        if (!IS_TOUCH) setHovered(true);
      }}
      onMouseLeave={() => {
        if (!IS_TOUCH) setHovered(false);
      }}
    >
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {header}
        {entries.map((entry) => (
          <ActivityRow
            key={entry.id}
            entry={entry}
            fontSize={baseFontSize}
            canResolveApproval={canResolveApproval}
            onResolveApproval={onResolveApproval}
            projectId={projectId}
            basePath={basePath}
          />
        ))}
        {renderCloseButton({ position: "absolute", right: 6, bottom: 6 })}
      </Space>
    </Card>
  );
}

function ActivityRow({
  entry,
  fontSize,
  canResolveApproval,
  onResolveApproval,
  projectId,
  basePath,
}: {
  entry: ActivityEntry;
  fontSize: number;
  canResolveApproval?: boolean;
  onResolveApproval?: (args: {
    approvalId: string;
    optionId?: string;
  }) => Promise<void> | void;
  projectId?: string;
  basePath?: string;
}) {
  const secondarySize = Math.max(11, fontSize - 2);
  switch (entry.kind) {
    case "reasoning":
      return (
        <Space>
          <Tag color="purple" style={{ marginBottom: 4 }}>
            Reasoning
          </Tag>
          {entry.text ? (
            <StaticMarkdown
              value={entry.text}
              style={{ fontSize, marginTop: 4 }}
            />
          ) : (
            <Text type="secondary" style={{ fontSize: secondarySize }}>
              …
            </Text>
          )}
        </Space>
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
              style={{ fontSize, marginTop: 4 }}
            />
          ) : (
            <Text type="secondary" style={{ fontSize: secondarySize }}>
              …
            </Text>
          )}
        </div>
      );
    case "diff":
      return (
        <div>
          <Tag color="geekblue" style={{ marginBottom: 4 }}>
            Diff
          </Tag>
          <PathLink
            path={entry.path}
            projectId={projectId}
            basePath={basePath}
            bold
          />
          <pre
            style={{
              background: "white",
              color: "#333",
              padding: "8px",
              borderRadius: 4,
              marginTop: 6,
              whiteSpace: "pre-wrap",
              fontSize,
            }}
          >
            {patchToText(entry.patch)}
          </pre>
        </div>
      );
    case "terminal":
      return <TerminalRow entry={entry} fontSize={fontSize} />;
    case "file":
      return (
        <FileRow
          entry={entry}
          fontSize={fontSize}
          projectId={projectId}
          basePath={basePath}
        />
      );
    case "approval":
      return (
        <ApprovalRow
          entry={entry}
          fontSize={fontSize}
          canResolveApproval={canResolveApproval}
          onResolveApproval={onResolveApproval}
        />
      );
    case "status":
    default:
      return (
        <Space size={6} align="center">
          <Tag color={entry.level === "error" ? "red" : "default"}>
            {entry.label}
          </Tag>
          {entry.detail ? (
            <Text
              type={entry.level === "error" ? "danger" : "secondary"}
              style={{ fontSize: secondarySize }}
            >
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
  const terminals = new Map<string, ActivityEntry & { kind: "terminal" }>();
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
      const entry = createEventEntry({
        event: message.event,
        seq,
        rows,
        terminals,
      });
      if (entry) {
        rows.push(entry);
      }
    }
  }
  return rows.sort((a, b) => a.seq - b.seq);
}

function createEventEntry({
  event,
  seq,
  rows,
  terminals,
}: {
  event: AcpStreamEvent;
  seq: number;
  rows: ActivityEntry[];
  terminals: Map<string, ActivityEntry & { kind: "terminal" }>;
}): ActivityEntry | undefined {
  if (event?.type === "diff") {
    return {
      kind: "diff",
      id: `diff-${seq}`,
      seq,
      path: stringifyPath(event.path),
      patch: normalizePatch(event.patch),
    };
  }
  if (event?.type === "terminal" && event.terminalId) {
    let entry = terminals.get(event.terminalId);
    if (entry == null) {
      entry = {
        kind: "terminal",
        id: `terminal-${event.terminalId}`,
        seq,
        terminalId: event.terminalId,
        command: event.command,
        args: event.args,
        cwd: event.cwd,
        output: "",
        truncated: event.truncated,
        exitStatus: event.exitStatus,
      };
      terminals.set(event.terminalId, entry);
      rows.push(entry);
    }
    if (event.phase === "start") {
      entry.command = event.command ?? entry.command;
      entry.args = event.args ?? entry.args;
      entry.cwd = event.cwd ?? entry.cwd;
    } else if (event.phase === "data") {
      entry.output = (entry.output ?? "") + (event.chunk ?? "");
      entry.truncated = event.truncated ?? entry.truncated;
    } else if (event.phase === "exit") {
      entry.exitStatus = event.exitStatus ?? entry.exitStatus;
      if (event.output != null) {
        entry.output = event.output;
      }
      entry.truncated = event.truncated ?? entry.truncated;
    }
    return undefined;
  }
  if (event?.type === "file") {
    return {
      kind: "file",
      id: `file-${seq}`,
      seq,
      path: stringifyPath(event.path),
      operation: event.operation,
      bytes: event.bytes,
      truncated: event.truncated,
      line: event.line,
      limit: event.limit,
      existed: event.existed,
    };
  }
  if (event?.type === "approval") {
    return {
      kind: "approval",
      id: `approval-${event.approvalId}`,
      seq,
      approvalId: event.approvalId,
      title: event.title,
      description: event.description,
      status: event.status,
      options: (event.options ?? []).map((option) => ({
        optionId: option.optionId,
        name: option.name,
        kind: option.kind,
      })),
      selectedOptionId:
        event.selectedOptionId === undefined
          ? undefined
          : (event.selectedOptionId as string | null),
      decidedAt: event.decidedAt ?? undefined,
      decidedBy: event.decidedBy ?? undefined,
      timeoutAt: event.timeoutAt ?? undefined,
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
    parts.push(truncate(message.finalResponse, 60));
  }
  if (message.usage) {
    parts.push(`Usage: ${formatUsage(message.usage)}`);
  }
  return parts.join(" · ");
}

function formatUsage(usage?: {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}) {
  if (!usage) return "";
  const parts: string[] = [];
  if (usage.input_tokens != null) parts.push(`${usage.input_tokens} in`);
  if (usage.output_tokens != null) parts.push(`${usage.output_tokens} out`);
  if (usage.reasoning_output_tokens)
    parts.push(`${usage.reasoning_output_tokens} reasoning`);
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
    return diffPrinter.patch_toText(decompressPatch(normalizePatch(patch)));
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

function PathLink({
  path,
  line,
  projectId,
  fontSize,
  bold,
  basePath,
}: {
  path?: string;
  line?: number;
  projectId?: string;
  fontSize?: number;
  bold?: boolean;
  basePath?: string;
}) {
  const actions =
    projectId != null ? redux.getProjectActions(projectId) : undefined;
  const resolvedPath = resolvePath(path, basePath);
  const onClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (!actions || !resolvedPath) return;
      e.preventDefault();
      actions.open_file({
        path: resolvedPath,
        line,
        foreground: true,
        chat: true,
        explicit: true,
      });
    },
    [actions, resolvedPath, line],
  );
  const node = (
    <code
      style={{
        fontSize,
        color: COLORS.GRAY_D,
        background: COLORS.GRAY_LLL,
        padding: "0 4px",
        borderRadius: 3,
        fontWeight: bold ? 600 : undefined,
      }}
    >
      {path || "(unknown)"}
    </code>
  );
  if (actions && resolvedPath) {
    return (
      <a
        href={resolvedPath}
        onClick={onClick}
        style={{ textDecoration: "none" }}
        role="button"
      >
        {node}
      </a>
    );
  }
  return node;
}

function resolvePath(path?: string, basePath?: string): string | undefined {
  if (!path) return undefined;
  const normalized = path.replace(/^\.\\/, "./").replace(/^\.\/+/, "");
  const hasDrive = /^[a-zA-Z]:[\\/]/.test(normalized);
  if (
    normalized.startsWith("/") ||
    hasDrive ||
    normalized.startsWith("~") ||
    normalized.startsWith("../")
  ) {
    return normalized;
  }
  if (!basePath) return normalized;
  const cleanBase = basePath.replace(/\/+$/, "");
  if (!cleanBase) return normalized;
  return `${cleanBase}/${normalized}`;
}

function TerminalRow({
  entry,
  fontSize,
}: {
  entry: Extract<ActivityEntry, { kind: "terminal" }>;
  fontSize: number;
}) {
  const commandLine = formatCommand(entry.command, entry.args);
  const status = formatTerminalStatus(entry);
  const hasOutput = Boolean(entry.output && entry.output.length > 0);
  const secondarySize = Math.max(11, fontSize - 2);
  const codeFontSize = Math.max(11, fontSize - 1);
  return (
    <div>
      <Tag color={COLORS.STAR} style={{ marginBottom: 6 }}>
        Terminal
      </Tag>
      <div
        style={{
          background: "#0f172a",
          color: "#e2e8f0",
          borderRadius: 6,
          padding: "10px 12px",
          fontFamily: "monospace",
          fontSize: codeFontSize,
          whiteSpace: "pre-wrap",
          lineHeight: 1.45,
          border: `1px solid ${COLORS.GRAY_L}`,
          maxHeight: 360,
          overflowY: "auto",
        }}
      >
        <div style={{ marginBottom: hasOutput ? 8 : 0 }}>
          <span style={{ color: "#94a3b8" }}>$</span>{" "}
          {commandLine ?? <span style={{ color: "#cbd5e1" }}>Command</span>}
          {entry.cwd ? (
            <span
              style={{
                marginLeft: 8,
                color: "#94a3b8",
                fontSize: secondarySize,
              }}
            >
              ({entry.cwd})
            </span>
          ) : null}
        </div>
        {hasOutput ? (
          <Ansi>{entry.output}</Ansi>
        ) : (
          <Text type="secondary" style={{ fontSize: secondarySize }}>
            {entry.exitStatus ? "No output captured." : "Waiting for output…"}
          </Text>
        )}
      </div>
      <Space size={8} wrap align="center" style={{ marginTop: 6 }}>
        {status ? (
          <Text type="secondary" style={{ fontSize: secondarySize }}>
            {status}
          </Text>
        ) : null}
        {entry.truncated ? (
          <Tag color="red" style={{ margin: 0 }}>
            Output truncated
          </Tag>
        ) : null}
      </Space>
    </div>
  );
}

function approvalStatusColor(status: AcpApprovalStatus): string {
  switch (status) {
    case "selected":
      return "green";
    case "cancelled":
      return "default";
    case "timeout":
      return "red";
    case "pending":
    default:
      return "gold";
  }
}

function formatApprovalStatus(
  status: AcpApprovalStatus,
  option?: ApprovalOption,
): string {
  if (status === "selected" && option) {
    return option.name;
  }
  switch (status) {
    case "pending":
      return "Pending";
    case "cancelled":
      return "Cancelled";
    case "timeout":
      return "Timed out";
    default:
      return "Approved";
  }
}

function formatApprovalDecision(
  entry: Extract<ActivityEntry, { kind: "approval" }>,
  option?: ApprovalOption,
): string {
  const decidedBy = entry.decidedBy ? ` by ${entry.decidedBy}` : "";
  const decidedAt = entry.decidedAt
    ? ` at ${formatTimestamp(entry.decidedAt)}`
    : "";
  switch (entry.status) {
    case "selected":
      return option
        ? `${option.name}${decidedBy}${decidedAt}`
        : `Approved${decidedBy}${decidedAt}`;
    case "cancelled":
      return `Cancelled${decidedBy}${decidedAt}`;
    case "timeout":
      return `Timed out${decidedAt}`;
    default:
      return "";
  }
}

function formatTimestamp(value?: string | null): string {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function FileRow({
  entry,
  fontSize,
  projectId,
  basePath,
}: {
  entry: Extract<ActivityEntry, { kind: "file" }>;
  fontSize: number;
  projectId?: string;
  basePath?: string;
}) {
  const isRead = entry.operation === "read";
  const actionLabel = isRead
    ? "Read"
    : entry.existed === false
      ? "Created"
      : "Wrote";
  const scope = formatReadScope(entry);
  const sizeLabel =
    typeof entry.bytes === "number" ? formatByteCount(entry.bytes) : undefined;
  const pathNode = (
    <PathLink
      path={entry.path}
      line={entry.line}
      projectId={projectId}
      fontSize={Math.max(11, fontSize - 2)}
      basePath={basePath}
    />
  );
  return (
    <div>
      <Space size={6} wrap align="center" style={{ marginBottom: 6 }}>
        <Tag color={isRead ? "blue" : "green"}>File</Tag>
        <Text strong style={{ fontSize }}>
          {actionLabel}
        </Text>
        {pathNode}
        {sizeLabel ? (
          <Text
            type="secondary"
            style={{ fontSize: Math.max(11, fontSize - 2) }}
          >
            {sizeLabel}
          </Text>
        ) : null}
        {scope ? (
          <Text
            type="secondary"
            style={{ fontSize: Math.max(11, fontSize - 2) }}
          >
            {scope}
          </Text>
        ) : null}
        {entry.truncated ? (
          <Tag color="orange" style={{ margin: 0 }}>
            Partial content
          </Tag>
        ) : null}
      </Space>
    </div>
  );
}

function ApprovalRow({
  entry,
  fontSize,
  canResolveApproval,
  onResolveApproval,
}: {
  entry: Extract<ActivityEntry, { kind: "approval" }>;
  fontSize: number;
  canResolveApproval?: boolean;
  onResolveApproval?: (args: {
    approvalId: string;
    optionId?: string;
  }) => Promise<void> | void;
}) {
  const pending = entry.status === "pending";
  const selectedOption = entry.options.find(
    (opt) => opt.optionId === entry.selectedOptionId,
  );
  const statusLabel = formatApprovalStatus(entry.status, selectedOption);
  const timeoutInfo =
    pending && entry.timeoutAt
      ? `Expires ${formatTimestamp(entry.timeoutAt)}`
      : undefined;
  const [submitting, setSubmitting] = useState(false);
  const disableActions =
    !canResolveApproval || !onResolveApproval || !pending || submitting;

  const resolve = async (optionId?: string) => {
    if (!onResolveApproval) return;
    try {
      setSubmitting(true);
      await onResolveApproval({
        approvalId: entry.approvalId,
        optionId,
      });
    } catch (err) {
      console.warn("failed to resolve approval", err);
      message.error("Failed to resolve approval");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Space size={6} align="center" wrap style={{ marginBottom: 6 }}>
        <Tag color="gold">Approval</Tag>
        {entry.title ? (
          <Text strong style={{ fontSize }}>
            {entry.title}
          </Text>
        ) : null}
        <Tag color={approvalStatusColor(entry.status)}>{statusLabel}</Tag>
        {timeoutInfo ? (
          <Text
            type="secondary"
            style={{ fontSize: Math.max(11, fontSize - 2) }}
          >
            {timeoutInfo}
          </Text>
        ) : null}
      </Space>
      {entry.description ? (
        <StaticMarkdown
          value={entry.description}
          style={{ fontSize, marginBottom: 6 }}
        />
      ) : null}
      {pending ? (
        <Space size={8} style={{ marginLeft: "10px" }} wrap>
          {entry.options.map((option) => (
            <Button
              key={option.optionId}
              size="small"
              type={option.kind?.startsWith("allow") ? "primary" : "default"}
              disabled={disableActions}
              loading={submitting}
              onClick={() => resolve(option.optionId)}
            >
              {option.name}
            </Button>
          ))}
          <Button
            size="small"
            danger
            disabled={disableActions}
            loading={submitting}
            onClick={() => resolve()}
          >
            Cancel
          </Button>
        </Space>
      ) : (
        <Text type="secondary" style={{ fontSize: Math.max(11, fontSize - 2) }}>
          {formatApprovalDecision(entry, selectedOption)}
        </Text>
      )}
    </div>
  );
}

function formatCommand(command?: string, args?: string[]): string | undefined {
  if (!command) return undefined;
  const { cmd, argv } = unwrapShellCommand(command, args ?? []);
  const parts = [cmd, ...argv].filter(
    (part): part is string => typeof part === "string",
  );
  return parts
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function unwrapShellCommand(
  command: string,
  args: string[],
): { cmd: string; argv: string[] } {
  const shells = new Set([
    "bash",
    "/bin/bash",
    "/usr/bin/bash",
    "sh",
    "/bin/sh",
    "/usr/bin/sh",
  ]);
  if (!shells.has(command)) {
    return { cmd: command, argv: args };
  }
  if (args.length >= 2 && (args[0] === "-lc" || args[0] === "-c")) {
    return { cmd: args[1], argv: [] };
  }
  if (args.length > 0) {
    return { cmd: args[0], argv: args.slice(1) };
  }
  return { cmd: command, argv: [] };
}

function formatTerminalStatus(entry: {
  exitStatus?: { exitCode?: number; signal?: string };
}): string | undefined {
  const status = entry.exitStatus;
  if (status == null) {
    return "Running…";
  }
  if (status.signal) {
    return `Terminated (${status.signal})`;
  }
  if (typeof status.exitCode === "number") {
    return status.exitCode === 0 ? "" : `Exited with code ${status.exitCode}`;
  }
  return "Completed";
}

function formatByteCount(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} ${plural(bytes, "byte")}`;
  }
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

function formatReadScope(entry: {
  operation: "read" | "write";
  line?: number;
  limit?: number;
}): string | undefined {
  if (entry.operation !== "read") return undefined;
  const lineInfo =
    typeof entry.line === "number" && entry.line > 1
      ? `from line ${entry.line}`
      : undefined;
  const limitInfo =
    typeof entry.limit === "number" && entry.limit > 0
      ? `${entry.limit} ${plural(entry.limit, "line")}`
      : undefined;
  if (!lineInfo && !limitInfo) return undefined;
  if (lineInfo && limitInfo) {
    return `${lineInfo}, ${limitInfo}`;
  }
  return lineInfo ?? limitInfo;
}

export default CodexActivity;
