import { Progress, Space, Spin } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import type { LroStatus } from "@cocalc/conat/hub/api/lro";
import {
  LRO_TERMINAL_STATUSES,
  isDismissed,
  progressBarStatus,
} from "@cocalc/frontend/lro/utils";
import type { RestoreLroState } from "@cocalc/frontend/project/restore-ops";
import { human_readable_size } from "@cocalc/util/misc";

const HIDE_STATUSES = new Set<LroStatus>(["succeeded"]);

export default function RestoreOps({ project_id }: { project_id: string }) {
  const restoreOps =
    useTypedRedux({ project_id }, "restore_ops")?.toJS() ?? {};
  const entries = Object.values(restoreOps) as RestoreLroState[];
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
        Restore operations
      </div>
      {active.map((op) => (
        <RestoreOpRow key={op.op_id} op={op} />
      ))}
    </div>
  );
}

function RestoreOpRow({ op }: { op: RestoreLroState }) {
  const summary = op.summary;
  if (summary && HIDE_STATUSES.has(summary.status)) {
    return null;
  }
  const percent = progressPercent(op);
  const statusText = formatStatusLine(op);
  const progressStatus = progressBarStatus(summary?.status);

  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={{ fontSize: "12px", marginBottom: "2px" }}>
        Restore operation
      </div>
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

function formatStatusLine(op: RestoreLroState): string {
  const summary = op.summary;
  if (summary?.status === "failed") {
    return summary.error ? `failed: ${summary.error}` : "failed";
  }
  if (summary?.status === "canceled") {
    return "canceled";
  }
  if (summary?.status === "expired") {
    return "expired";
  }
  const progress = op.last_progress;
  const message =
    progress?.message ?? progress?.phase ?? summary?.progress_summary?.phase;
  const detail = formatProgressDetail(progress?.detail);
  if (message && detail) {
    return `${message} • ${detail}`;
  }
  if (message) {
    return message;
  }
  if (detail) {
    return detail;
  }
  return summary?.status ?? "running";
}

function progressPercent(op: RestoreLroState): number | undefined {
  const progress = op.last_progress?.progress;
  if (progress != null) {
    return Math.max(0, Math.min(100, Math.round(progress)));
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

function formatSpeed(speed?: string | number): string | undefined {
  if (speed == null) return undefined;
  if (typeof speed === "number") {
    if (!Number.isFinite(speed)) return undefined;
    return `${human_readable_size(speed, true)}/s`;
  }
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

function getUpdatedAt(op: RestoreLroState): number {
  const summary = op.summary;
  if (!summary?.updated_at) return 0;
  const date = new Date(summary.updated_at as any);
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}
