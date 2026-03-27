/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared "pending exec commands" bar used by the coding agent and the
app-building agent (agent-panel).  Renders the command list with per-
command Run/Dismiss buttons, and optional Run All + Auto toggle controls
when the corresponding callbacks are supplied.
*/

import { Button, Tooltip } from "antd";

import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import type { ExecBlock } from "../coding-agent-types";

export interface PendingExecBarProps {
  pendingExec: ExecBlock[];
  onRun: (blockId: number, command: string) => void;
  onDismiss: (blockId: number) => void;
  onDismissAll?: () => void;
  /** When provided, a "Run All" button is shown in the header. */
  onRunAll?: () => void;
  /** Current state of the auto-exec toggle. */
  autoExec?: boolean;
  /** When provided, an "Auto" toggle button is shown in the header. */
  onAutoExecChange?: (v: boolean) => void;
}

export function PendingExecBar({
  pendingExec,
  onRun,
  onDismiss,
  // onDismissAll reserved for future "Dismiss All" button
  onRunAll,
  autoExec,
  onAutoExecChange,
}: PendingExecBarProps) {
  if (pendingExec.length === 0) return null;

  return (
    <div
      style={{
        flex: "0 0 auto",
        padding: "6px 12px",
        borderTop: `1px solid ${COLORS.GRAY_L}`,
        background: COLORS.YELL_LLL,
      }}
    >
      <div
        style={{
          marginBottom: 4,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="terminal" /> Commands to run:
        <div style={{ flex: 1 }} />
        {onRunAll && (
          <Button size="small" type="primary" onClick={onRunAll}>
            <Icon name="play" /> Run All
          </Button>
        )}
        {onAutoExecChange && (
          <Tooltip title="When enabled, exec commands run automatically without asking">
            <Button
              size="small"
              type={autoExec ? "primary" : "default"}
              onClick={() => {
                const next = !autoExec;
                onAutoExecChange(next);
                if (next && onRunAll) {
                  // Run all currently pending commands when enabling auto
                  onRunAll();
                }
              }}
            >
              <Icon name="bolt" /> Auto
            </Button>
          </Tooltip>
        )}
      </div>
      {pendingExec.map((cmd) => (
        <div
          key={cmd.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <code
            style={{
              flex: 1,
              fontSize: "0.85em",
              background: COLORS.GRAY_LLL,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {cmd.command}
          </code>
          <Button
            size="small"
            type="primary"
            onClick={() => onRun(cmd.id, cmd.command)}
          >
            <Icon name="play" /> Run
          </Button>
          <Button size="small" onClick={() => onDismiss(cmd.id)}>
            Dismiss
          </Button>
        </div>
      ))}
    </div>
  );
}
