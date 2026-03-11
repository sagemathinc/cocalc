/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Segmented, Spin } from "antd";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import type { ChatActions } from "@cocalc/frontend/chat/actions";
import { initChat } from "@cocalc/frontend/chat/register";
import SideChat from "@cocalc/frontend/chat/side-chat";
import { Icon } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { chatroom } from "@cocalc/frontend/frame-editors/chat-editor/editor";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { NotebookAgent } from "@cocalc/frontend/frame-editors/jupyter-editor/notebook-agent";
import { CodingAgentEmbedded } from "@cocalc/frontend/frame-editors/llm/coding-agent";
import { labels } from "@cocalc/frontend/i18n";
import { hidden_meta_file } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { EditorComponentProps, EditorDescription } from "../frame-tree/types";

export { hasEmbeddedAgent } from "./has-embedded-agent";
import { hasEmbeddedAgent } from "./has-embedded-agent";

// Agent lookup — maps file path to the right embedded agent component.
// Both agents share the same { chatSyncdb } interface.  To add a new
// agent type, add an entry here and create the component.
// Returns null for file types that don't support the coding agent.
function getEmbeddedAgent(
  path: string,
): ComponentType<{ chatSyncdb: any }> | null {
  if (!hasEmbeddedAgent(path)) return null;
  if (path.endsWith(".ipynb")) return NotebookAgent;
  return CodingAgentEmbedded;
}

export function chatFile(path: string): string {
  return hidden_meta_file(path, "sage-chat");
}

type ChatMode = "chat" | "assistant";

function Chat({ font_size, desc }: EditorComponentProps) {
  const { project_id, path: path0, actions, id: frameId } = useFrameContext();
  const path = chatFile(path0);
  const EmbeddedAgent = getEmbeddedAgent(path0);
  const [sideChatActions, setSideChatActions] = useState<ChatActions | null>(
    null,
  );
  // Track when the chat syncdb is ready (actions.syncdb becomes non-null).
  // CodingAgentEmbedded must NOT mount until this is set, otherwise it
  // falls back to standalone mode and shows stale data.
  const [chatSyncdbReady, setChatSyncdbReady] = useState(false);

  // Read the active tab mode from the frame tree state.
  const mode: ChatMode = desc.get("chat_mode") ?? "chat";

  const setMode = (newMode: ChatMode) => {
    actions.set_frame_tree({ id: frameId, chat_mode: newMode });
  };

  useEffect(() => {
    let checkInterval: ReturnType<typeof setInterval> | undefined;
    let safetyTimeout: ReturnType<typeof setTimeout> | undefined;
    // Guard against the async IIFE resuming after unmount — if the
    // component unmounts during the await, cleanup runs first, then
    // the IIFE resumes and would create an uncleaned setInterval.
    let mounted = true;

    (async () => {
      // properly set the side chat compute server, if necessary
      await redux
        .getProjectActions(project_id)
        .setSideChatComputeServerId(path0);
      if (!mounted) return;

      const sideChatActions = initChat(project_id, path);
      sideChatActions.frameTreeActions = actions;
      sideChatActions.frameId = frameId;
      setSideChatActions(sideChatActions);

      // sideChatActions.syncdb is set in the SyncDB "ready" handler
      // inside initChat. Poll briefly until it's available so agent
      // components don't mount with syncdb=undefined.
      if (sideChatActions.syncdb) {
        setChatSyncdbReady(true);
      } else {
        checkInterval = setInterval(() => {
          if (!mounted) {
            clearInterval(checkInterval);
            checkInterval = undefined;
            return;
          }
          if (sideChatActions.syncdb) {
            clearInterval(checkInterval);
            checkInterval = undefined;
            setChatSyncdbReady(true);
          }
        }, 200);
        // Safety: stop polling after 60s
        safetyTimeout = setTimeout(() => {
          if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = undefined;
          }
        }, 60_000);
      }
    })();

    return () => {
      mounted = false;
      if (checkInterval) clearInterval(checkInterval);
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, []);

  if (sideChatActions == null) {
    return null;
  }

  // If no agent is available for this file type, force chat-only mode.
  const effectiveMode = EmbeddedAgent == null ? "chat" : mode;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Tab selector — only show when an agent is available */}
      {EmbeddedAgent != null && (
        <div
          style={{
            padding: "6px 8px",
            borderBottom: `1px solid ${COLORS.GRAY_L}`,
            background: COLORS.GRAY_LLL,
          }}
        >
          {/* Highlight the active segment in AI color when assistant is selected */}
          {effectiveMode === "assistant" && (
            <style>{`.chat-mode-toggle .ant-segmented-item-selected { background: ${COLORS.AI_ASSISTANT_BG} !important; }`}</style>
          )}
          <Segmented
            className="chat-mode-toggle"
            value={effectiveMode}
            onChange={(v) => setMode(v as ChatMode)}
            options={[
              {
                value: "chat",
                label: (
                  <span>
                    <Icon name="comment" /> Chat
                  </span>
                ),
              },
              {
                value: "assistant",
                label: (
                  <span>
                    <AIAvatar size={16} /> Assistant
                  </span>
                ),
              },
            ]}
            block
          />
        </div>
      )}

      {/* Content area — position:relative + absolute child guarantees
           a definite height for the embedded agent, avoiding flex-height
           resolution issues that prevent overflowY from working. */}
      <div style={{ flex: 1, position: "relative" }}>
        {effectiveMode === "chat" ? (
          <SideChat
            actions={sideChatActions}
            project_id={project_id}
            path={path}
            fontSize={font_size}
            desc={desc}
          />
        ) : !chatSyncdbReady ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            <Spin />
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            {EmbeddedAgent && (
              <EmbeddedAgent chatSyncdb={sideChatActions.syncdb} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const commands: any = {};
for (const x in chatroom.commands) {
  if (x == "time_travel" || x == "show_search") {
    continue;
  }
  commands[x] = true;
}
export const chat: EditorDescription = {
  type: "chat",
  short: labels.chat,
  name: labels.chat,
  icon: "comment",
  commands,
  component: Chat,
} as const;

export function getSideChatActions({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}): ChatActions | null {
  const actions = redux.getEditorActions(project_id, chatFile(path));
  if (actions == null) {
    return null;
  }
  return actions as ChatActions;
}

// TODO: this is an ugly special case for now to make the title bar buttons work.
// TODO: but wait -- those buttons are gone now, so maybe this can be deleted?!
export function undo(project_id, path) {
  return getSideChatActions({ project_id, path })?.undo();
}
export function redo(project_id, path) {
  return getSideChatActions({ project_id, path })?.redo();
}
