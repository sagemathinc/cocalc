import { Progress, Space, Spin } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import type { LroEvent, LroStatus, LroSummary } from "@cocalc/conat/hub/api/lro";
import { plural } from "@cocalc/util/misc";

type CopyLroState = {
  op_id: string;
  summary?: LroSummary;
  last_progress?: Extract<LroEvent, { type: "progress" }>;
  last_event?: LroEvent;
};

const TERMINAL_STATUSES = new Set<LroStatus>([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

export default function CopyOps({ project_id }: { project_id: string }) {
  const copyOps =
    useTypedRedux({ project_id }, "copy_ops")?.toJS() ?? {};
  const entries = Object.values(copyOps) as CopyLroState[];
  const active = entries.filter(
    (op) => !op.summary || !TERMINAL_STATUSES.has(op.summary.status),
  );
  if (!active.length) {
    return null;
  }
  active.sort((a, b) => getUpdatedAt(b) - getUpdatedAt(a));

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: "4px",
        padding: "6px 8px",
        marginBottom: "8px",
        background: "white",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: "12px", marginBottom: "6px" }}>
        Copy operations
      </div>
      {active.map((op) => (
        <CopyOpRow key={op.op_id} op={op} />
      ))}
    </div>
  );
}

function CopyOpRow({ op }: { op: CopyLroState }) {
  const summary = op.summary;
  const title = formatTitle(summary);
  const percent = progressPercent(op);
  const statusText = formatStatusLine(op);
  const progressStatus = progressBarStatus(summary?.status);

  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={{ fontSize: "12px", marginBottom: "2px" }}>{title}</div>
      <Space size="small" align="center">
        {percent == null ? (
          <Spin size="small" />
        ) : (
          <Progress
            percent={percent}
            status={progressStatus}
            size="small"
            style={{ width: "180px" }}
          />
        )}
        <span style={{ fontSize: "11px", color: "#666" }}>{statusText}</span>
      </Space>
    </div>
  );
}

function formatTitle(summary?: LroSummary): string {
  const src = summary?.input?.src?.path;
  const dests = summary?.input?.dests;
  const pathCount = Array.isArray(src) ? src.length : src ? 1 : 0;
  const destCount = Array.isArray(dests) ? dests.length : dests ? 1 : 0;
  if (pathCount && destCount) {
    return `Copy ${pathCount} ${plural(pathCount, "path")} to ${destCount} ${plural(
      destCount,
      "project",
    )}`;
  }
  if (pathCount) {
    return `Copy ${pathCount} ${plural(pathCount, "path")}`;
  }
  return "Copy operation";
}

function formatStatusLine(op: CopyLroState): string {
  const summary = op.summary;
  const progress = op.last_progress;
  const message = progress?.message ?? progress?.phase;
  const counts = formatCounts(summary?.progress_summary ?? {});
  if (message && counts) {
    return `${message} • ${counts}`;
  }
  if (message) {
    return message;
  }
  if (counts) {
    return counts;
  }
  return summary?.status ?? "running";
}

function formatCounts(summary: any): string {
  const total = summary.total;
  const done = summary.done ?? summary.local ?? 0;
  const queued = summary.queued ?? 0;
  const applying = summary.applying ?? 0;
  const failed = summary.failed ?? 0;
  const canceled = summary.canceled ?? 0;
  const expired = summary.expired ?? 0;
  const parts: string[] = [];
  if (total != null) {
    parts.push(`${done}/${total} done`);
  } else {
    if (done) parts.push(`${done} done`);
  }
  if (queued) parts.push(`${queued} queued`);
  if (applying) parts.push(`${applying} applying`);
  if (failed) parts.push(`${failed} failed`);
  if (canceled) parts.push(`${canceled} canceled`);
  if (expired) parts.push(`${expired} expired`);
  return parts.join(", ");
}

function progressPercent(op: CopyLroState): number | undefined {
  const progress = op.last_progress?.progress;
  if (progress != null) {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }
  const summary = op.summary?.progress_summary ?? {};
  const total = summary.total;
  const done = summary.done ?? summary.local;
  if (total && done != null) {
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }
  return undefined;
}

function progressBarStatus(status?: LroStatus): "active" | "exception" | "success" {
  if (status === "failed" || status === "canceled" || status === "expired") {
    return "exception";
  }
  if (status === "succeeded") {
    return "success";
  }
  return "active";
}

function getUpdatedAt(op: CopyLroState): number {
  const summary = op.summary;
  if (!summary?.updated_at) return 0;
  const date = new Date(summary.updated_at as any);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}
