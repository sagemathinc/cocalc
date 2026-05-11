/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Read-only "this thread is resolved" panel that replaces the reply input on
a resolved (LaTeX collaborative-TODO) thread. Shows who resolved it and
when, plus a "Start new chat thread" affordance that — after the user
confirms the target file/line — calls the editor's `insertChatMarker`.

The panel is editor-agnostic at the UI layer: it discovers the marker
target via `frameTreeActions.previewMarkerInsertion()` and then fires
`frameTreeActions.insertChatMarker()` on confirm. Editors that don't
provide those methods just hide the button (defensive — only LaTeX wires
this in for now).
*/

import { useState } from "react";
import { Button, Popconfirm } from "antd";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import type { ChatActions } from "./actions";

interface Props {
  actions: ChatActions;
  account_id: string;
  at: string; // ISO timestamp
}

export function ResolvedThreadPanel({ actions, account_id, at }: Props) {
  const userMap = useTypedRedux("users", "user_map");
  const meAccountId = redux.getStore("account")?.get_account_id();

  const resolvedAt = new Date(at);
  const resolvedDateText = isNaN(resolvedAt.valueOf())
    ? at
    : resolvedAt.toLocaleString();

  let resolverName = "Someone";
  if (account_id && account_id === meAccountId) {
    resolverName = "You";
  } else if (account_id && userMap != null) {
    const u = userMap.get(account_id);
    const first = u?.get("first_name") ?? "";
    const last = u?.get("last_name") ?? "";
    const full = `${first} ${last}`.trim();
    if (full) resolverName = full;
  }

  const [target, setTarget] = useState<{ path: string; line: number } | null>(
    null,
  );
  const editorActions: any = actions.frameTreeActions;
  const canStartNew =
    typeof editorActions?.previewMarkerInsertion === "function" &&
    typeof editorActions?.insertChatMarker === "function";

  const handleOpenStartNew = () => {
    if (!canStartNew) return;
    try {
      setTarget(editorActions.previewMarkerInsertion());
    } catch {
      setTarget(null);
    }
  };
  const handleConfirmStartNew = () => {
    if (!canStartNew) return;
    void editorActions.insertChatMarker({});
    setTarget(null);
  };

  return (
    <div
      style={{
        margin: "5px 10px",
        padding: "12px 16px",
        background: COLORS.GRAY_LL,
        border: `1px solid ${COLORS.GRAY_L}`,
        borderRadius: 6,
        color: COLORS.GRAY_DD,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Icon
        name="check-circle"
        style={{ color: COLORS.GRAY_M, fontSize: "1.1em" }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500 }}>This chat is resolved.</div>
        <div style={{ fontSize: "0.9em", color: COLORS.GRAY_M }}>
          Resolved by {resolverName} on {resolvedDateText}. Replies are disabled
          — start a new thread to continue the discussion at a fresh location.
        </div>
      </div>
      {canStartNew && (
        <Popconfirm
          title="Start a new chat thread?"
          description={
            <div style={{ maxWidth: 320 }}>
              {target == null ? (
                <span>
                  No active editor pane. Click into a <code>.tex</code> file
                  first so the new marker has a target.
                </span>
              ) : (
                <span>
                  This will insert a new <code>% chat:</code> marker in{" "}
                  <code>{target.path}</code> at line {target.line + 1} and open
                  a fresh chat thread there.
                </span>
              )}
            </div>
          }
          okText={target == null ? undefined : "Insert marker"}
          cancelText="Cancel"
          okButtonProps={{ disabled: target == null }}
          onConfirm={handleConfirmStartNew}
          onOpenChange={(open) => {
            if (open) handleOpenStartNew();
          }}
          placement="topRight"
        >
          <Button type="primary" size="small">
            <Icon name="comment" /> Start new chat thread
          </Button>
        </Popconfirm>
      )}
    </div>
  );
}
