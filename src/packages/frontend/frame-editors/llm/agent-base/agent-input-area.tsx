/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Shared input area for agent panels: wraps a custom input component
(children) with Send/Stop and optional Done buttons.
*/

import { Button, Tooltip } from "antd";

import { Icon } from "@cocalc/frontend/components";

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
}

export function AgentInputArea({
  session,
  children,
  onSubmit,
  sendDisabled = false,
  showDone = false,
  doneHighlight = false,
  aboveButtons,
}: AgentInputAreaProps) {
  const { generating, handleNewSession, messages } = session;

  const handleCancel = () => {
    session.cancelRef.current = true;
    session.setGenerating(false);
  };

  const hasAssistantResponse = messages.some(
    (m) => m.sender === "assistant" && m.event === "message",
  );

  return (
    <div style={{ ...INPUT_AREA_STYLE, display: "flex" }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
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
                        background: "#52c41a",
                        borderColor: "#52c41a",
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
  );
}
