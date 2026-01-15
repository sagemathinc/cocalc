import { Progress, Space, Spin } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import type { LroEvent, LroStatus, LroSummary } from "@cocalc/conat/hub/api/lro";

type MoveLroState = {
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

export default function MoveOps({ project_id }: { project_id: string }) {
  const moveOp = useTypedRedux({ project_id }, "move_lro")?.toJS() as
    | MoveLroState
    | undefined;
  if (!moveOp) {
    return null;
  }
  const summary = moveOp.summary;
  const terminal = summary && TERMINAL_STATUSES.has(summary.status);
  if (terminal) {
    return null;
  }
  const percent = progressPercent(moveOp);
  const statusText = formatStatusLine(moveOp);
  const progressStatus = progressBarStatus(summary?.status);

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
        Move operation
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

function formatStatusLine(op: MoveLroState): string {
  const summary = op.summary;
  const progress = op.last_progress;
  const message = progress?.message ?? progress?.phase;
  if (message) {
    return message;
  }
  const phase = summary?.progress_summary?.phase;
  if (phase) {
    return phase;
  }
  return summary?.status ?? "running";
}

function progressPercent(op: MoveLroState): number | undefined {
  const progress = op.last_progress?.progress;
  if (progress != null) {
    return Math.max(0, Math.min(100, Math.round(progress)));
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
