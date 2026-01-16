import { Button, Popconfirm, Progress, Space, Spin } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import type { LroStatus } from "@cocalc/conat/hub/api/lro";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  LRO_DISMISSABLE_STATUSES,
  LRO_TERMINAL_STATUSES,
  isDismissed,
  progressBarStatus,
} from "@cocalc/frontend/lro/utils";
import type { MoveLroState } from "@cocalc/frontend/project/move-ops";

const HIDE_STATUSES = new Set<LroStatus>(["succeeded"]);

export default function MoveOps({ project_id }: { project_id: string }) {
  const { actions } = useProjectContext();
  const moveOp = useTypedRedux({ project_id }, "move_lro")?.toJS() as
    | MoveLroState
    | undefined;
  if (!moveOp) {
    return null;
  }
  const summary = moveOp.summary;
  if (summary && HIDE_STATUSES.has(summary.status)) {
    return null;
  }
  if (isDismissed(summary)) {
    return null;
  }
  const canDismiss =
    summary != null && LRO_DISMISSABLE_STATUSES.has(summary.status);
  const canCancel = summary != null && !LRO_TERMINAL_STATUSES.has(summary.status);
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
        {canCancel ? (
          <Popconfirm
            title="Cancel this move operation?"
            okText="Cancel"
            cancelText="Keep"
            onConfirm={() =>
              webapp_client.conat_client.hub.lro.cancel({ op_id: moveOp.op_id })
            }
          >
            <Button size="small" type="link">
              Cancel
            </Button>
          </Popconfirm>
        ) : null}
        {canDismiss ? (
          <Button
            size="small"
            type="link"
            onClick={() => actions?.dismissMoveLro(moveOp.op_id)}
          >
            Dismiss
          </Button>
        ) : null}
      </Space>
    </div>
  );
}

function formatStatusLine(op: MoveLroState): string {
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
  const phase = summary?.progress_summary?.phase;
  if (phase) {
    return phase;
  }
  const progress = op.last_progress;
  const message = progress?.phase ?? progress?.message;
  if (message) {
    return message;
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
