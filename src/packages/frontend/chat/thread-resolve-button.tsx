/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
"Resolve" affordance shown next to the ThreadAnchorButton at the top of
an anchored thread's side chat. Mirrors the inline marker-tail check so
the user doesn't have to find the marker in the source first.

Editor-agnostic at the UI level: only renders when the host editor
exposes `resolveChatMarker(hash)` (currently only LaTeX); other editors
can ignore this and the button silently hides.
*/

import { Button, Popconfirm, Tooltip } from "antd";

import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

import type { ChatActions } from "./actions";

interface Props {
  anchorId: string;
  actions: ChatActions;
}

const BUTTON_STYLE = {
  // Match the green of the inline tail's check icon so the visual ties
  // these two entry points together as the "resolve" action.
  background: COLORS.BS_GREEN_LL,
  borderColor: COLORS.ANTD_GREEN,
  color: COLORS.BS_GREEN_D,
} as const;

export function ThreadResolveButton({ anchorId, actions }: Props) {
  const editorActions = actions.frameTreeActions as any;
  if (
    editorActions == null ||
    typeof editorActions.resolveChatMarker !== "function"
  ) {
    return null;
  }
  return (
    <Popconfirm
      title="Resolve chat and remove marker?"
      description={
        <div style={{ maxWidth: 320 }}>
          Marks the chat thread as <b>resolved</b> and removes every{" "}
          <code>% chat: …</code> marker from all files. The thread is kept in{" "}
          <code>.sage-chat</code> as a read-only archive.
        </div>
      }
      okText="Resolve"
      cancelText="Cancel"
      onConfirm={() => {
        void editorActions.resolveChatMarker(anchorId);
      }}
      placement="bottomRight"
    >
      <Tooltip title="Resolve this chat (mark TODO done) and remove its markers">
        <Button style={BUTTON_STYLE} icon={<Icon name="check-circle" />} />
      </Tooltip>
    </Popconfirm>
  );
}
