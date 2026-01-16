import { Progress, Space, Spin, Typography } from "antd";
import { TimeElapsed } from "@cocalc/frontend/components";
import type { LroStatus } from "@cocalc/conat/hub/api/lro";
import { capitalize } from "@cocalc/util/misc";
import type { HostLroState } from "../hooks/use-host-ops";

const ACTIVE_STATUSES = new Set<LroStatus>(["queued", "running"]);

const KIND_LABELS: Record<string, string> = {
  "host-start": "Start",
  "host-stop": "Stop",
  "host-restart": "Restart",
  "host-deprovision": "Deprovision",
  "host-delete": "Delete",
  "host-force-deprovision": "Force deprovision",
  "host-remove-connector": "Remove connector",
};

function toTimestamp(value?: Date | string | null): number | undefined {
  if (!value) return undefined;
  const date = new Date(value as any);
  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

function progressPercent(op: HostLroState): number | undefined {
  const progress = op.last_progress?.progress;
  if (progress != null) {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }
  return undefined;
}

function opLabel(op: HostLroState): string {
  const summary = op.summary;
  const kind = summary?.kind ?? op.kind;
  if (kind === "host-restart" && summary?.input?.mode === "hard") {
    return "Hard restart";
  }
  if (kind && KIND_LABELS[kind]) {
    return KIND_LABELS[kind];
  }
  if (kind) {
    const cleaned = kind.replace(/^host-/, "").replace(/-/g, " ");
    return capitalize(cleaned);
  }
  return "Host op";
}

export function HostOpProgress({
  op,
  compact = false,
}: {
  op?: HostLroState;
  compact?: boolean;
}) {
  if (!op) {
    return null;
  }
  const summary = op.summary;
  const status = summary?.status ?? "queued";
  if (summary && !ACTIVE_STATUSES.has(summary.status)) {
    return null;
  }
  const phase =
    summary?.progress_summary?.phase ??
    op.last_progress?.phase ??
    op.last_progress?.message;
  const label = phase ? capitalize(phase) : capitalize(status);
  const start_ts = toTimestamp(summary?.started_at ?? summary?.created_at);
  const percent = progressPercent(op);
  const actionLabel = opLabel(op);

  if (compact) {
    return (
      <Typography.Text
        type="secondary"
        style={{
          fontSize: 11,
          display: "inline-block",
          width: "26ch",
          maxWidth: "26ch",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {actionLabel}: {label}
        {start_ts != null && (
          <>
            {" "}
            · <TimeElapsed start_ts={start_ts} longform={false} />
          </>
        )}
      </Typography.Text>
    );
  }

  return (
    <Space direction="vertical" size={2} style={{ width: "100%" }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {actionLabel}: {label}
        {start_ts != null && (
          <>
            {" "}
            · <TimeElapsed start_ts={start_ts} />
          </>
        )}
      </Typography.Text>
      {percent != null ? (
        <Progress percent={percent} size="small" />
      ) : (
        <Spin size="small" />
      )}
    </Space>
  );
}
