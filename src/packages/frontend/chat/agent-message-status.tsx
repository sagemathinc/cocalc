/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Badge, Button, Drawer } from "antd";
import { useState } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";
import CodexLogPanel from "./codex-log-panel";
import type { ActivityLogContext } from "./actions/activity-logs";

type LogRefs = {
  store?: string;
  key?: string;
  subject?: string;
};

interface AgentMessageStatusProps {
  show: boolean;
  generating: boolean;
  durationLabel: string;
  fontSize?: number;
  project_id?: string;
  path?: string;
  date: number;
  fallbackLogRefs: LogRefs;
  activityContext: ActivityLogContext;
}

export function AgentMessageStatus({
  show,
  generating,
  durationLabel,
  fontSize,
  project_id,
  path,
  date,
  fallbackLogRefs,
  activityContext,
}: AgentMessageStatusProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [activitySize, setActivitySize0] = useState<number>(
    parseInt(localStorage?.acpActivitySize ?? "600"),
  );
  const setActivitySize = (size: number) => {
    setActivitySize0(size);
    try {
      localStorage.acpActivitySize = size;
    } catch {}
  };

  if (!show) return null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <Badge status={generating ? "processing" : "default"} />
        <Button
          size="small"
          onClick={() => setShowDrawer(true)}
          title="View Codex activity log"
        >
          {generating ? "Working" : `Worked for\n${durationLabel}`}
        </Button>
        {generating ? <span style={{ color: COLORS.GRAY_D }}>Live</span> : null}
      </div>

      <Drawer
        title="Codex activity"
        placement="right"
        open={showDrawer}
        onClose={() => setShowDrawer(false)}
        destroyOnClose
        size={activitySize}
        resizable={{
          onResize: setActivitySize,
        }}
      >
        <CodexLogPanel
          generating={generating === true}
          fontSize={fontSize}
          persistKey={`${(project_id ?? "no-project").slice(0, 8)}:${
            path ?? ""
          }:${date}`}
          basePath={undefined}
          logStore={fallbackLogRefs.store}
          logKey={fallbackLogRefs.key}
          logSubject={fallbackLogRefs.subject}
          logProjectId={project_id}
          logEnabled={showDrawer}
          activityContext={activityContext}
          durationLabel={generating === true ? durationLabel : durationLabel}
          projectId={project_id}
        />
      </Drawer>
    </>
  );
}
