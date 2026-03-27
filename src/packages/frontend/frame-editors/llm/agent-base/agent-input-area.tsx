/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared input area for agent panels: wraps a custom input component
(children) with Send/Stop and optional Done buttons.
*/

import { Button, Tooltip } from "antd";
import { useEffect, useRef } from "react";

import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import type { AgentSession } from "./types";
import { INPUT_AREA_STYLE } from "./types";

interface AgentInputAreaProps {
  session: AgentSession;
  /** The input component (MarkdownInput, TextArea, etc.) */
  children: React.ReactNode;
  /** Called when the user clicks Send. */
  onSubmit: () => void;
  /** Whether the send button should be disabled (beyond the generating check). */
  sendDisabled?: boolean;
  /** Show a "Done" button that creates a new turn. Default false. */
  showDone?: boolean;
  /** Highlight the Done button (green) to encourage closing the turn. */
  doneHighlight?: boolean;
  /** Optional content above the buttons (e.g. cost estimation). */
  aboveButtons?: React.ReactNode;
  /** Optional content shown below the input area. */
  belowInput?: React.ReactNode;
  /** Called when the user clicks Stop — e.g. to restore the input. */
  onCancel?: () => void;
}

export function AgentRollbackHint({
  onOpenTimeTravel,
}: {
  onOpenTimeTravel: () => void;
}) {
  return (
    <div
      style={{
        fontSize: "0.8em",
        color: COLORS.GRAY_M,
        textAlign: "center",
      }}
    >
      AI can make mistakes. Use{" "}
      <Button
        type="text"
        size="small"
        onClick={onOpenTimeTravel}
        style={{
          paddingInline: 0,
          height: "auto",
          minWidth: 0,
          fontSize: "inherit",
          lineHeight: "inherit",
          color: COLORS.GRAY_M,
        }}
      >
        TimeTravel
      </Button>{" "}
      to undo changes.
    </div>
  );
}

export function AgentInputArea({
  session,
  children,
  onSubmit,
  sendDisabled = false,
  showDone = false,
  doneHighlight = false,
  aboveButtons,
  belowInput,
  onCancel,
}: AgentInputAreaProps) {
  const { generating, handleNewSession, messages } = session;
  const containerRef = useRef<HTMLDivElement>(null);
  const prevGeneratingRef = useRef(generating);
  // Track whether the user actively navigated away from the input
  // (clicked into the editor, etc.) during generation.  If so, don't
  // steal focus back when the turn finishes.
  const userBlurredRef = useRef(false);

  // Refocus the input when generation ends — but only if the user
  // didn't actively click elsewhere during the turn.
  useEffect(() => {
    if (prevGeneratingRef.current && !generating && !userBlurredRef.current) {
      const el = containerRef.current?.querySelector(
        "textarea, [contenteditable]",
      ) as HTMLElement | null;
      el?.focus();
    }
    if (generating) {
      // Reset the blur flag at the start of each generation cycle
      userBlurredRef.current = false;
    }
    prevGeneratingRef.current = generating;
  }, [generating]);

  const handleCancel = () => {
    session.cancelRef.current = true;
    session.setGenerating(false);
    onCancel?.();
  };

  const hasAssistantResponse = messages.some(
    (m) => m.sender === "assistant" && m.event === "message",
  );

  return (
    <div
      ref={containerRef}
      style={{
        ...INPUT_AREA_STYLE,
        display: "flex",
        flexDirection: "column",
      }}
      onBlur={(e) => {
        if (
          generating &&
          !e.currentTarget.contains((e.relatedTarget as Node | null) ?? null)
        ) {
          userBlurredRef.current = true;
        }
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            ...(generating
              ? { pointerEvents: "none", opacity: 0.5 }
              : undefined),
          }}
        >
          {children}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 4,
          }}
        >
          <div style={{ flex: 1 }} />
          {aboveButtons}
          {generating ? (
            <Button onClick={handleCancel} style={{ height: "36px" }}>
              <Icon name="stop" /> Stop
            </Button>
          ) : (
            <Tooltip title="Send message (shift+enter)">
              <Button
                type="primary"
                onClick={onSubmit}
                disabled={sendDisabled}
                style={{ height: "36px" }}
                icon={<Icon name="paper-plane" />}
              >
                Send
              </Button>
            </Tooltip>
          )}
          {showDone && (
            <>
              <div style={{ height: "4px" }} />
              <Tooltip
                title={
                  doneHighlight
                    ? "Edits applied — close this turn to save tokens"
                    : "Close this turn and start a new one"
                }
              >
                <Button
                  onClick={handleNewSession}
                  disabled={!hasAssistantResponse}
                  type={doneHighlight ? "primary" : "default"}
                  style={{
                    height: "36px",
                    ...(doneHighlight
                      ? {
                          background: COLORS.BS_GREEN,
                          borderColor: COLORS.BS_GREEN,
                        }
                      : {}),
                  }}
                >
                  <Icon name="check" /> Done
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
      {belowInput != null && <div style={{ marginTop: 3 }}>{belowInput}</div>}
    </div>
  );
}
