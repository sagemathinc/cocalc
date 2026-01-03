import {
  Button,
  Card,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from "antd";
import { Icon } from "@cocalc/frontend/components";
import type {
  AcpStreamEvent,
  AcpStreamMessage,
} from "@cocalc/conat/ai/acp/types";
import {
  React,
  redux,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  background_color,
  setTheme,
} from "@cocalc/frontend/frame-editors/terminal-editor/themes";
import { COLOR_THEMES } from "@cocalc/frontend/frame-editors/terminal-editor/theme-data";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { LineDiffResult } from "@cocalc/util/line-diff";
import { plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const { Text } = Typography;
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
      diff: LineDiffResult;
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
    };

export interface CodexActivityProps {
  events?: AcpStreamMessage[];
  generating?: boolean;
  fontSize?: number;
  durationLabel?: string;
  persistKey?: string;
  projectId?: string;
  basePath?: string;
  onDeleteEvents?: () => void;
  onDeleteAllEvents?: () => void;
  expanded?: boolean;
}

// Persist log visibility per chat message so Virtuoso remounts don’t reset it.
const expandedState = new Map<string, boolean>();

export const CodexActivity: React.FC<CodexActivityProps> = ({
  events,
  generating,
  fontSize,
  durationLabel,
  persistKey,
  projectId,
  basePath,
  onDeleteEvents,
  onDeleteAllEvents,
  expanded: initExpanded,
}): React.ReactElement | null => {
  const entries = useMemo(() => normalizeEvents(events ?? []), [events]);
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (persistKey) {
      const persisted = expandedState.get(persistKey);
      if (persisted != null) return persisted;
    }
    return !!initExpanded;
  });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!persistKey) return;
    expandedState.set(persistKey, expanded);
  }, [persistKey, expanded]);

  useEffect(() => {
    if (!persistKey) return;
    const persisted = expandedState.get(persistKey);
    const next = persisted ?? (generating || expanded);
    if (next !== expanded) {
      setExpanded(next);
    }
  }, [persistKey, generating]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entries.length) return null;

  const baseFontSize = fontSize ?? 13;
  const secondarySize = Math.max(11, baseFontSize - 2);
  const durationSummary =
    durationLabel && durationLabel.trim().length > 0
      ? `Worked for ${durationLabel}`
      : `${entries.length} ${plural(entries.length, "step")}`;
  const toggleLabel = expanded ? "Hide log" : `${durationSummary} (show)`;

  const showCloseButton = IS_TOUCH || hovered;

  if (!expanded) {
    return (
      <div style={{ marginTop: 8, marginLeft: -8, marginBottom: 8 }}>
        <Button size="small" type="text" onClick={() => setExpanded(true)}>
          {toggleLabel}
        </Button>
      </div>
    );
  }

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

  const headerActions = (
    <Space size={6} align="center">
      {onDeleteEvents ? (
        <Popconfirm
          title="Delete this activity log?"
          okText="Delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true, size: "small" }}
          onConfirm={onDeleteEvents}
        >
          <Button size="small" danger type="text">
            Delete
          </Button>
        </Popconfirm>
      ) : null}
      {onDeleteAllEvents ? (
        <Popconfirm
          title="Delete all activity logs in this thread?"
          okText="Delete all"
          cancelText="Cancel"
          okButtonProps={{ danger: true, size: "small" }}
          onConfirm={onDeleteAllEvents}
        >
          <Button size="small" danger type="text">
            Delete all
          </Button>
        </Popconfirm>
      ) : null}
      {renderCloseButton()}
    </Space>
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
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {headerActions}
      </div>
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
            projectId={projectId}
            basePath={basePath}
          />
        ))}
        {renderCloseButton({ position: "absolute", right: 6, bottom: 6 })}
      </Space>
    </Card>
  );
};

function ActivityRow({
  entry,
  fontSize,
  projectId,
  basePath,
}: {
  entry: ActivityEntry;
  fontSize: number;
  projectId?: string;
  basePath?: string;
}) {
  const secondarySize = Math.max(11, fontSize - 2);
  switch (entry.kind) {
    case "reasoning":
      return (
        <Space>
          {/*<Tag color="purple" style={{ marginBottom: 4 }}>
            Reasoning
          </Tag>*/}
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
          {/* <Tag color="geekblue" style={{ marginBottom: 4 }}>
            Diff
          </Tag>*/}
          <PathLink
            path={entry.path}
            projectId={projectId}
            basePath={basePath}
            bold
          />
          <DiffPreview diff={entry.diff} fontSize={fontSize} />
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
  const sorted = rows.sort((a, b) => a.seq - b.seq);
  return coalesceTextEntries(coalesceFileReads(sorted));
}

function coalesceFileReads(entries: ActivityEntry[]): ActivityEntry[] {
  const merged: ActivityEntry[] = [];
  for (const entry of entries) {
    if (
      entry.kind === "file" &&
      entry.operation === "read" &&
      merged.length > 0
    ) {
      const last = merged[merged.length - 1];
      if (
        last.kind === "file" &&
        last.operation === "read" &&
        last.path === entry.path
      ) {
        const bytes =
          typeof last.bytes === "number" || typeof entry.bytes === "number"
            ? (last.bytes ?? 0) + (entry.bytes ?? 0)
            : undefined;
        merged[merged.length - 1] = {
          ...last,
          bytes,
          truncated: last.truncated || entry.truncated,
          // Multiple read slices: clear scope so we don't mislead with a line range.
          line: undefined,
          limit: undefined,
        };
        continue;
      }
    }
    merged.push(entry);
  }
  return merged;
}

// Codex "exec" emits separate reasoning/agent items that are often meant to be read
// as one block, but adjacent fragments sometimes lose blank lines (e.g., bold headers
// run into the previous paragraph). Coalescing adjacent text entries with \n\n keeps
// the original content while restoring readable paragraph breaks.
function coalesceTextEntries(entries: ActivityEntry[]): ActivityEntry[] {
  const merged: ActivityEntry[] = [];
  for (const entry of entries) {
    if ((entry.kind === "reasoning" || entry.kind === "agent") && merged.length > 0) {
      const last = merged[merged.length - 1];
      if (last.kind === entry.kind) {
        const lastText = last.text ?? "";
        const nextText = entry.text ?? "";
        merged[merged.length - 1] = {
          ...last,
          text:
            lastText && nextText ? `${lastText}\n\n${nextText}` : lastText || nextText,
        };
        continue;
      }
    }
    merged.push(entry);
  }
  return merged;
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
      diff: event.diff,
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

function eventHasText(
  event?: AcpStreamEvent,
): event is Extract<AcpStreamEvent, { text: string }> {
  return event?.type === "thinking" || event?.type === "message";
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

function DiffPreview({
  diff,
  fontSize,
}: {
  diff: LineDiffResult;
  fontSize: number;
}) {
  if (!diff?.lines?.length) {
    // ?'s for old input
    return (
      <Text type="secondary" style={{ fontSize: Math.max(11, fontSize - 2) }}>
        No changes detected.
      </Text>
    );
  }
  const codeFontSize = Math.max(11, fontSize - 1);
  const chunkEnds = new Set(diff.chunkBoundaries ?? []);
  return (
    <div
      style={{
        marginTop: 6,
        fontFamily: "monospace",
        fontSize: codeFontSize,
        border: `1px solid ${COLORS.GRAY_L}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {diff.lines.map((line, i) => {
        const op = diff.types[i] ?? 0;
        const gutter = diff.gutters[i] ?? "";
        const background =
          op === -1 ? "#ffeef0" : op === 1 ? "#e6ffed" : "transparent";
        const color = op === 0 ? COLORS.GRAY_D : "inherit";
        const borderTop = chunkEnds.has(i)
          ? `1px solid ${COLORS.GRAY_L}`
          : "none";
        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 8,
              padding: "2px 8px",
              background,
              color,
              borderTop,
              whiteSpace: "pre-wrap",
            }}
          >
            <span style={{ color: COLORS.GRAY_D }}>{gutter}</span>
            <span>{line.length ? line : " "}</span>
          </div>
        );
      })}
    </div>
  );
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
  const [hovered, setHovered] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  const commandLine = formatCommand(entry.command, entry.args);
  const status = formatTerminalStatus(entry);
  const hasOutput = Boolean(entry.output && entry.output.length > 0);
  const secondarySize = Math.max(11, fontSize - 2);
  const cwdPrompt = entry.cwd ? shortenPath(entry.cwd) : "~";
  const coloredCwd = `\u001b[01;34m${cwdPrompt}\u001b[0m`;
  const promptLine = `${coloredCwd}$${commandLine ? " " + commandLine : ""}`;
  const truncatedNote = entry.truncated ? "\n[output truncated]" : "";
  const outputText = (entry.output ?? "").trimEnd();
  const terminalText = hasOutput
    ? `${promptLine}\n${outputText}${truncatedNote}`
    : `${promptLine}${truncatedNote}`;
  const placeholderText = entry.exitStatus
    ? "No output."
    : "Waiting for output…";

  const copyOutput = React.useCallback(() => {
    const textToCopy = hasOutput ? terminalText : promptLine;
    if (!textToCopy) return;
    const doCopy = async () => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(textToCopy);
          message.success("Copied terminal output");
          return;
        }
      } catch {
        // fallback below
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        message.success("Copied terminal output");
      } catch (err) {
        message.error("Failed to copy");
        console.warn("copy failed", err);
      }
    };
    void doCopy();
  }, [hasOutput, terminalText, promptLine]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <TerminalPreview
        text={terminalText}
        fontSize={fontSize}
        placeholder={!hasOutput}
        placeholderText={placeholderText}
        onCopyShortcut={showRaw ? undefined : copyOutput}
        rawMode={showRaw}
      />
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
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          display: "flex",
          gap: 6,
          alignItems: "center",
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.2s ease",
          background: "white",
        }}
      >
        <Button
          size="small"
          type="text"
          onClick={copyOutput}
          disabled={!hasOutput && !promptLine}
        >
          <Icon name="copy" />
        </Button>
        <Switch
          size="small"
          checked={showRaw}
          onChange={() => setShowRaw((v) => !v)}
          checkedChildren="Raw"
          unCheckedChildren="Raw"
        />
      </div>
    </div>
  );
}

function TerminalPreview({
  text,
  fontSize,
  placeholder = false,
  placeholderText,
  onCopyShortcut,
  rawMode = false,
}: {
  text: string;
  fontSize: number;
  placeholder?: boolean;
  placeholderText?: string;
  onCopyShortcut?: () => void;
  rawMode?: boolean;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const termRef = React.useRef<XTerm | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const terminalPrefs =
    useTypedRedux("account", "terminal")?.toJS() ?? undefined;
  const colorScheme = terminalPrefs?.color_scheme ?? "default";
  const fontFamily = terminalPrefs?.font ?? "monospace";
  const fontSizePref = Number.isFinite(fontSize)
    ? fontSize
    : (terminalPrefs?.font_size ?? 13);
  const theme = COLOR_THEMES[colorScheme] ?? COLOR_THEMES["default"];
  const background = background_color(colorScheme);
  const foreground = theme?.colors?.[16] ?? "#e2e8f0";
  const normalizedText = (text ?? "").trimEnd();
  const allLines = normalizedText.length ? normalizedText.split(/\r?\n/) : [""];
  const collapsedLines = 5;
  const hasOverflow = !placeholder && allLines.length > collapsedLines;
  const visibleLines =
    showAll || !hasOverflow ? allLines : allLines.slice(0, collapsedLines);
  const visibleText = visibleLines.join("\n");
  const lineCount = Math.max(1, visibleLines.length);
  const lineHeight = (fontSizePref || 13) * 1.45;
  const rows = Math.max(1, lineCount);
  const containerHeight = rows * lineHeight + 8;
  const showExpandButton = hasOverflow && !showAll;
  const expandButton = showExpandButton ? (
    <Button
      size="small"
      type="text"
      onClick={() => setShowAll(true)}
      style={{
        position: "absolute",
        bottom: 4,
        left: "50%",
        transform: "translateX(-50%)",
        fontSize: Math.max(10, fontSize - 3),
        padding: "0 6px",
        height: 20,
        lineHeight: "18px",
        border: `1px solid ${COLORS.GRAY_L}`,
        borderRadius: 10,
        background: COLORS.GRAY_LLL,
        color: COLORS.GRAY_D,
        zIndex: 1,
      }}
      aria-label="Show all terminal output"
    >
      Show all
    </Button>
  ) : null;

  React.useEffect(() => {
    // Tear down when entering raw mode.
    if (rawMode) {
      if (termRef.current) {
        try {
          termRef.current.dispose();
        } catch {
          // ignore
        } finally {
          termRef.current = null;
        }
      }
      return;
    }
    const host = containerRef.current;
    if (!host) return;
    // Recreate terminal fresh when toggling back from raw.
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch {
        // ignore
      }
      termRef.current = null;
    }
    const term = new XTerm({
      convertEol: true,
      disableStdin: true,
      fontFamily,
      fontSize: fontSizePref,
      scrollback: 0,
      rows,
      cols: 100,
    });
    setTheme(term, colorScheme);
    termRef.current = term;
    term.open(host);
    const viewport = host.querySelector(
      ".xterm-viewport",
    ) as HTMLDivElement | null;
    const rowsEl = host.querySelector(".xterm-rows") as HTMLDivElement | null;
    if (viewport) {
      viewport.style.overflow = "hidden";
    }
    if (rowsEl) {
      rowsEl.style.userSelect = "text";
    }
    host.style.height = `${containerHeight}px`;
    host.style.userSelect = "text";
    return () => {
      try {
        term.dispose();
      } catch {
        // ignore
      } finally {
        termRef.current = null;
      }
    };
  }, [colorScheme, fontFamily, fontSizePref, rows, rawMode, containerHeight]);

  React.useEffect(() => {
    if (rawMode) return;
    const term = termRef.current;
    if (!term) return;
    let scrollTimer: any;
    try {
      term.reset();
      setTheme(term, colorScheme);
    } catch {
      // ignore theme errors when disposed
    }
    const host = containerRef.current;
    if (host) {
      const viewport = host.querySelector(
        ".xterm-viewport",
      ) as HTMLDivElement | null;
      const rowsEl = host.querySelector(".xterm-rows") as HTMLDivElement | null;
      if (viewport?.style) {
        viewport.style.overflow = "hidden";
      }
      if (rowsEl?.style) {
        rowsEl.style.userSelect = "text";
      }
      host.style.height = `${containerHeight}px`;
      host.style.userSelect = "text";
    }
    const rendered = visibleText.replace(/\r?\n/g, "\r\n");
    if (rendered.length) {
      term.write(rendered);
    }
    term.scrollToTop();
    // xterm sometimes scrolls after write; ensure we stay at the top.
    scrollTimer = setTimeout(() => {
      try {
        term.scrollToTop();
      } catch {
        // ignore
      }
    }, 0);
    return () => {
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [visibleText, colorScheme, placeholder, rawMode, containerHeight]);

  return rawMode ? (
    <div
      style={{
        border: `1px solid ${COLORS.GRAY_L}`,
        borderRadius: 6,
        background: COLORS.GRAY_LLL,
        color: COLORS.GRAY_D,
        padding: showExpandButton ? "8px 8px 26px" : "8px",
        fontFamily: "monospace",
        fontSize,
        position: "relative",
      }}
    >
      <pre
        style={{
          margin: 0,
          fontFamily: "inherit",
          fontSize: "inherit",
          color: "inherit",
          whiteSpace: "pre-wrap",
        }}
      >
        {visibleText || placeholderText || ""}
      </pre>
      {expandButton}
    </div>
  ) : (
    <div
      style={{
        border: `1px solid ${COLORS.GRAY_L}`,
        borderRadius: 6,
        background,
        color: foreground,
        overflow: "hidden",
        padding: showExpandButton ? "4px 6px 26px" : "4px 6px",
        fontFamily,
        fontSize: Math.max(11, fontSize - 1),
        position: "relative",
      }}
      onKeyDown={(e) => {
        if (
          onCopyShortcut &&
          ((e.ctrlKey && e.key.toLowerCase() === "c") ||
            (e.metaKey && e.key.toLowerCase() === "c"))
        ) {
          e.preventDefault();
          onCopyShortcut();
        }
      }}
      tabIndex={0}
    >
      <div
        ref={containerRef}
        style={{ minHeight: placeholder ? containerHeight - 8 : 0 }}
        aria-label="terminal-output"
      />
      {placeholder ? (
        <Text type="secondary" style={{ fontSize: Math.max(11, fontSize - 2) }}>
          {placeholderText ?? text}
        </Text>
      ) : null}
      {expandButton}
    </div>
  );
}

function shortenPath(path?: string): string {
  if (!path) return "~";
  if (path.startsWith("./")) {
    return "~" + path.slice(1);
  }
  const homeMatch = path.match(/^\/home\/([^/]+)(.*)$/);
  if (homeMatch) {
    return homeMatch[2] ? `~${homeMatch[2]}` : "~";
  }
  const rootMatch = path.match(/^\/root(.*)$/);
  if (rootMatch) {
    return rootMatch[1] ? `~${rootMatch[1]}` : "~";
  }
  return path;
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
        {/*<Tag color={isRead ? "blue" : "green"}>File</Tag> */}
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

function formatCommand(command?: string, args?: string[]): string | undefined {
  if (!command) return undefined;
  const { cmd, argv } = unwrapShellCommand(command, args ?? []);
  const cleaned = [cmd, ...argv]
    .filter((part): part is string => typeof part === "string")
    .map(stripOuterQuotes);
  if (!cleaned.length) return undefined;
  const [head, ...rest] = cleaned;
  const tail = rest.map((part) =>
    /\s/.test(part) ? JSON.stringify(part) : part,
  );
  return [head, ...tail].join(" ");
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
  // Some events arrive with a fully composed shell string in `command`, so
  // peel off `/bin/bash -lc "..."` to show the actual user command.
  if (!args.length) {
    const inline = command.match(
      /^(?:\/usr\/bin\/|\/bin\/)?(?:bash|sh)\s+-l?c\s+([\s\S]+)$/,
    );
    if (inline?.[1]) {
      return { cmd: inline[1], argv: [] };
    }
  }
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

function stripOuterQuotes(value: string): string {
  if (!value) return value;
  const match = value.match(/^["']([\s\S]*)["']$/);
  return match ? match[1] : value;
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

// Convert Codex activity events into markdown for exports.
export function codexEventsToMarkdown(events: AcpStreamMessage[]): string {
  const entries = normalizeEvents(events ?? []);
  if (!entries.length) return "";
  const lines: string[] = [];
  for (const entry of entries) {
    switch (entry.kind) {
      case "reasoning":
        lines.push(
          entry.text ? `- Reasoning: ${entry.text}` : "- Reasoning step",
        );
        break;
      case "agent":
        lines.push(entry.text ? `- Agent: ${entry.text}` : "- Agent message");
        break;
      case "status": {
        const detail =
          entry.detail && entry.detail.trim().length > 0
            ? `: ${entry.detail}`
            : "";
        lines.push(`- ${entry.label}${detail}`);
        break;
      }
      case "terminal": {
        const cmd = formatCommand(entry.command, entry.args) ?? "Command";
        const cwd = entry.cwd ? ` (cwd ${entry.cwd})` : "";
        const status = formatTerminalStatus(entry);
        let block = `- Terminal: ${cmd}${cwd}`;
        if (entry.output && entry.output.length > 0) {
          block += `\n\n\`\`\`\n${entry.output}\n\`\`\``;
        }
        const tags: string[] = [];
        if (entry.truncated) {
          tags.push("output truncated");
        }
        if (status) {
          tags.push(status);
        }
        if (tags.length) {
          block += `\n\n(${tags.join(", ")})`;
        }
        lines.push(block);
        break;
      }
      case "file": {
        const path =
          entry.path && entry.path.length > 0
            ? formatPathMarkdown(entry.path, entry.line)
            : "(file)";
        const action =
          entry.operation === "read"
            ? "Read"
            : entry.existed === false
              ? "Created"
              : "Wrote";
        const parts = [`- File: ${action} ${path}`];
        if (typeof entry.bytes === "number") {
          parts.push(`(${formatByteCount(entry.bytes)})`);
        }
        const scope = formatReadScope(entry);
        if (scope) {
          parts.push(`(${scope})`);
        }
        if (entry.truncated) {
          parts.push("(output truncated)");
        }
        lines.push(parts.join(" "));
        break;
      }
      default:
        break;
    }
  }
  return lines.join("\n\n");
}

function formatPathMarkdown(path: string, line?: number): string {
  const clean = path.replace(/^[./]+/, "");
  const label = line != null ? `${clean}#L${line}` : clean;
  const href = clean ? `./${clean}` : ".";
  const link = line != null ? `${href}#L${line}` : href;
  return `[${label}](${link})`;
}

export default CodexActivity;
