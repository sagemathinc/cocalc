/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Badge, Button, Drawer } from "antd";
import { useEffect, useRef, useState } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";
import CodexLogPanel from "./codex-log-panel";
import type { ActivityLogContext } from "./actions/activity-logs";

const activityScrollPositions = new Map<string, number>();
const SCROLL_BOTTOM_SENTINEL = Number.POSITIVE_INFINITY;
const SCROLL_BOTTOM_EPSILON = 1;

function getSavedScrollPosition(node: HTMLDivElement): number {
  const maxTop = node.scrollHeight - node.clientHeight;
  if (maxTop > 0 && node.scrollTop >= maxTop - SCROLL_BOTTOM_EPSILON) {
    return SCROLL_BOTTOM_SENTINEL;
  }
  return node.scrollTop;
}

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
  const persistKey = `${(project_id ?? "no-project").slice(0, 8)}:${
    path ?? ""
  }:${date}`;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pendingRestoreRef = useRef<number | null>(null);
  const restoringRef = useRef(false);
  const [contentVersion, setContentVersion] = useState(0);
  const setActivitySize = (size: number) => {
    setActivitySize0(size);
    try {
      localStorage.acpActivitySize = size;
    } catch {}
  };
  const handleDrawerClose = () => {
    const node = scrollRef.current;
    if (node) {
      activityScrollPositions.set(persistKey, getSavedScrollPosition(node));
    }
    pendingRestoreRef.current = null;
    setShowDrawer(false);
  };
  const handleScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    if (restoringRef.current) return;
    activityScrollPositions.set(persistKey, getSavedScrollPosition(node));
    pendingRestoreRef.current = null;
  };

  useEffect(() => {
    if (!showDrawer) return;
    const saved = activityScrollPositions.get(persistKey);
    pendingRestoreRef.current = saved ?? null;
  }, [persistKey, showDrawer]);

  useEffect(() => {
    if (!showDrawer) return;
    if (typeof requestAnimationFrame === "function") {
      let frame: number | undefined;
      let cancelled = false;
      const deadline = Date.now() + 1500;
      const attemptRestore = () => {
        if (cancelled) return;
        const node = scrollRef.current;
        const target = pendingRestoreRef.current;
        if (!node || target == null) return;
        const maxTop = node.scrollHeight - node.clientHeight;
        const wantsBottom = target === SCROLL_BOTTOM_SENTINEL;
        if (!wantsBottom && maxTop < target && Date.now() < deadline) {
          frame = requestAnimationFrame(attemptRestore);
          return;
        }
        const nextTop = wantsBottom
          ? Math.max(0, maxTop)
          : Math.min(target, Math.max(0, maxTop));
        restoringRef.current = true;
        node.scrollTop = nextTop;
        frame = requestAnimationFrame(() => {
          restoringRef.current = false;
          if (wantsBottom && Date.now() < deadline) {
            frame = requestAnimationFrame(attemptRestore);
            return;
          }
          pendingRestoreRef.current = null;
          activityScrollPositions.set(persistKey, getSavedScrollPosition(node));
        });
      };
      frame = requestAnimationFrame(attemptRestore);
      return () => {
        cancelled = true;
        if (frame != null) cancelAnimationFrame(frame);
      };
    }
    const node = scrollRef.current;
    const target = pendingRestoreRef.current;
    if (!node || target == null) return;
    const maxTop = node.scrollHeight - node.clientHeight;
    const nextTop =
      target === SCROLL_BOTTOM_SENTINEL
        ? Math.max(0, maxTop)
        : Math.min(target, Math.max(0, maxTop));
    restoringRef.current = true;
    node.scrollTop = nextTop;
    restoringRef.current = false;
    pendingRestoreRef.current = null;
    activityScrollPositions.set(persistKey, getSavedScrollPosition(node));
  }, [persistKey, showDrawer, contentVersion]);

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
        onClose={handleDrawerClose}
        destroyOnClose
        size={activitySize}
        resizable={{
          onResize: setActivitySize,
        }}
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ height: "100%", overflowY: "auto" }}
        >
          <CodexLogPanel
            generating={generating === true}
            fontSize={fontSize}
            persistKey={persistKey}
            basePath={undefined}
            logStore={fallbackLogRefs.store}
            logKey={fallbackLogRefs.key}
            logSubject={fallbackLogRefs.subject}
            logProjectId={project_id}
            logEnabled={showDrawer}
            activityContext={activityContext}
            onEventsChange={() => setContentVersion((prev) => prev + 1)}
            durationLabel={generating === true ? durationLabel : durationLabel}
            projectId={project_id}
          />
        </div>
      </Drawer>
    </>
  );
}
