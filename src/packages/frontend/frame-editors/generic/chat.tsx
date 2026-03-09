/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Segmented, Spin } from "antd";
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

export function chatFile(path: string): string {
  return hidden_meta_file(path, "sage-chat");
}

type ChatMode = "chat" | "assistant";

function Chat({ font_size, desc }: EditorComponentProps) {
  const { project_id, path: path0, actions, id: frameId } = useFrameContext();
  const path = chatFile(path0);
  const isJupyter = path0.endsWith(".ipynb");
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
    (async () => {
      // properly set the side chat compute server, if necessary
      await redux
        .getProjectActions(project_id)
        .setSideChatComputeServerId(path0);
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
        const check = setInterval(() => {
          if (sideChatActions.syncdb) {
            clearInterval(check);
            setChatSyncdbReady(true);
          }
        }, 200);
        // Safety: stop polling after 60s
        setTimeout(() => clearInterval(check), 60_000);
      }
    })();
  }, []);

  if (sideChatActions == null) {
    return null;
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Tab selector */}
      <div
        style={{
          padding: "6px 8px",
          borderBottom: `1px solid ${COLORS.GRAY_L}`,
          background: COLORS.GRAY_LLL,
        }}
      >
        <Segmented
          value={mode}
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
                  <AIAvatar size={14} /> Assistant
                </span>
              ),
            },
          ]}
          block
          size="small"
        />
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {mode === "chat" ? (
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
        ) : isJupyter ? (
          <NotebookAgent
            chatSyncdb={sideChatActions.syncdb}
            jupyterActions={(actions as any).jupyter_actions}
            project_id={project_id}
          />
        ) : (
          <CodingAgentEmbedded chatSyncdb={sideChatActions.syncdb} />
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
