/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button as AntdButton, Tooltip } from "antd";

import { useActions, useIsMountedRef } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { getJupyterActions } from "@cocalc/frontend/frame-editors/whiteboard-editor/elements/code/actions";
import { tab_to_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

interface CloseEditorProps {
  activeTab?: string;
  project_id: string;
}

export function CloseEditor({
  activeTab,
  project_id,
}: CloseEditorProps): JSX.Element | null {
  const isMounted = useIsMountedRef();
  const actions = useActions({ project_id });

  async function handleOnClick(e: React.MouseEvent) {
    e.preventDefault();
    if (activeTab == null) return;
    const path = tab_to_path(activeTab);
    if (path == null) return;
    try {
      if (path.endsWith(".ipynb")) {
        const jupyter_actions = await getJupyterActions({ project_id, path });
        if (!isMounted.current) return;
        if (jupyter_actions != null) {
          jupyter_actions.halt();
        }
      }
    } catch (err) {
      console.error("Problem stopping jupyter kernel, ignoring", err);
    }
    actions?.close_tab(path); // this unmounts the top actions including this close button
  }

  return (
    <Tooltip title={<>Close Editor</>}>
      <AntdButton
        type="text"
        onClick={handleOnClick}
        style={{ color: COLORS.GRAY_M, fontSize: "12px", padding: "0" }}
        icon={<Icon name="times" />}
      />
    </Tooltip>
  );
}
