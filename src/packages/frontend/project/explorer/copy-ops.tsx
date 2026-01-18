import { Button, Popconfirm, Progress, Space, Spin } from "antd";
import { useRef } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import type { LroSummary } from "@cocalc/conat/hub/api/lro";
import { human_readable_size, plural } from "@cocalc/util/misc";
import {
  LRO_TERMINAL_STATUSES,
  isDismissed,
  progressBarStatus,
} from "@cocalc/frontend/lro/utils";
import type { CopyLroState } from "@cocalc/frontend/project/copy-ops";

export default function CopyOps({ project_id }: { project_id: string }) {
  const copyOps = useTypedRedux({ project_id }, "copy_ops")?.toJS() ?? {};
  const entries = Object.values(copyOps) as CopyLroState[];
  const active = entries.filter(
    (op) =>
      !op.summary ||
      (!LRO_TERMINAL_STATUSES.has(op.summary.status) &&
        !isDismissed(op.summary)),
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
  const lastDetailRef = useRef<string | undefined>(undefined);
  const progress = op.last_progress;
  const detail = formatProgressDetail(progress?.detail);
  if (detail) {
    lastDetailRef.current = detail;
  }
  const statusText = formatStatusLine(op, detail ?? lastDetailRef.current);
  const progressStatus = progressBarStatus(summary?.status);
  const canCancel = summary && !LRO_TERMINAL_STATUSES.has(summary.status);

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
        {canCancel && (
          <Popconfirm
            title="Cancel this copy operation?"
            okText="Cancel"
            cancelText="Keep"
            onConfirm={() =>
              webapp_client.conat_client.hub.lro.cancel({ op_id: op.op_id })
            }
          >
            <Button type="link" size="small">
              Cancel
            </Button>
          </Popconfirm>
        )}
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

function formatStatusLine(op: CopyLroState, detailOverride?: string): string {
  const summary = op.summary;
  const progress = op.last_progress;
  const message =
    summary?.progress_summary?.phase ?? progress?.phase ?? progress?.message;
  const counts = formatCounts(summary?.progress_summary ?? {});
  const detail = detailOverride ?? formatProgressDetail(progress?.detail);
  if (message && counts) {
    return detail
      ? `${message} • ${counts} • ${detail}`
      : `${message} • ${counts}`;
  }
  if (message) {
    return detail ? `${message} • ${detail}` : message;
  }
  if (counts) {
    return detail ? `${counts} • ${detail}` : counts;
  }
  if (detail) {
    return detail;
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

function formatProgressDetail(detail?: any): string | undefined {
  if (!detail) return undefined;
  const parts: string[] = [];
  const speed = formatSpeed(detail.speed);
  if (speed) parts.push(speed);
  const eta = formatEta(detail.eta);
  if (eta) parts.push(`ETA ${eta}`);
  return parts.length ? parts.join(", ") : undefined;
}

function formatSpeed(speed?: string): string | undefined {
  if (!speed) return undefined;
  const numeric = Number.parseFloat(speed);
  if (!Number.isFinite(numeric)) {
    return speed;
  }
  return `${human_readable_size(numeric, true)}/s`;
}

function formatEta(eta?: number): string | undefined {
  if (eta == null || eta <= 0) return undefined;
  if (eta < 1000) return `${Math.round(eta)} ms`;
  if (eta < 60_000) return `${Math.round(eta / 1000)} s`;
  return `${Math.round(eta / 1000 / 60)} min`;
}

function getUpdatedAt(op: CopyLroState): number {
  const summary = op.summary;
  if (!summary?.updated_at) return 0;
  const date = new Date(summary.updated_at as any);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}
