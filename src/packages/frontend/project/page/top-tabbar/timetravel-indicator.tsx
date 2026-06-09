/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { ReactNode } from "react";
import { Button, Tooltip } from "antd";
import { useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import track from "@cocalc/frontend/user-tracking";
import { history_path } from "@cocalc/util/misc";
import { EditorActions } from "./types";

interface TopBarTimetravelButtonProps {
  path: string;
  actions: EditorActions;
}

export function TopBarTimetravelButton({
  path,
  actions,
}: TopBarTimetravelButtonProps): ReactNode {
  const intl = useIntl();

  // ChatActions, CourseActions, ArchiveActions don't have time_travel.
  const timeTravel = (actions as any).time_travel;
  if (typeof timeTravel !== "function") return null;

  // Don't show on the time-travel editor itself.
  if (path === history_path(path) || path.endsWith(".time-travel")) {
    return null;
  }

  const tooltip = intl.formatMessage(labels.timetravel_title);

  return (
    <Tooltip title={tooltip} mouseEnterDelay={0.7}>
      <Button
        size="middle"
        style={{
          // Faint tint of the classic TimeTravel accent color so the
          // button reads as "time travel" at a glance.
          background:
            "color-mix(in srgb, #5bc0de 10%, var(--cocalc-bg-elevated, #fff))",
          borderColor:
            "color-mix(in srgb, #5bc0de 35%, var(--cocalc-border-light, #d9d9d9))",
        }}
        onClick={() => {
          track("time-travel", { source: "top-tabbar", path });
          // Prefer opening as a frame inside this editor when the editor
          // has a time_travel frame type registered. Otherwise fall back
          // to opening history as a tab — matches the title-bar button.
          const a = actions as any;
          const frame =
            typeof a.hasFrameType === "function"
              ? a.hasFrameType("time_travel")
              : false;
          a.time_travel({ frame });
        }}
      >
        <Icon name="history" />
      </Button>
    </Tooltip>
  );
}
