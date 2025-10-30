/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/*
Single-file view of a Jupyter notebook using CodeMirror 6.

This component displays the entire notebook as a single document where:
- Input cells are mapped to line ranges
- Outputs are rendered as CodeMirror widgets
- Status bar at the top shows kernel state
- Kernel selector modal when clicking kernel or no kernel available
*/

import { Map } from "immutable";

import { CSS, React, Rendered, useRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { EditorState } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import useKernelUsage from "@cocalc/frontend/jupyter/kernel-usage";
import { KernelSelector } from "@cocalc/frontend/jupyter/select-kernel";
import { Kernel } from "@cocalc/frontend/jupyter/status";
import { syncdbPath } from "@cocalc/util/jupyter/names";

import { COLORS } from "@cocalc/util/theme";
import { JupyterEditorActions } from "../actions";
import { SingleFileEditor } from "./editor";

interface Props {
  id: string;
  name: string;
  actions: JupyterEditorActions;
  editor_state: EditorState;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  font_size: number;
  is_current: boolean;
  is_visible: boolean;
  desc: Map<string, any>;
}

const CONTAINER_STYLE: CSS = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflowY: "hidden",
} as const;

const EDITOR_CONTAINER_STYLE: CSS = {
  flex: 1,
  overflow: "hidden",
} as const;

export const SingleFileView: React.FC<Props> = React.memo(
  (props: Props): Rendered => {
    // Actions for the underlying Jupyter notebook state, kernel state, etc.
    const jupyter_actions: JupyterActions = props.actions.jupyter_actions;
    const name = jupyter_actions.name;

    // Redux state for kernel selector visibility
    const check_select_kernel_init: undefined | boolean = useRedux([
      name,
      "check_select_kernel_init",
    ]);
    const show_kernel_selector: undefined | boolean = useRedux([
      name,
      "show_kernel_selector",
    ]);
    const read_only: undefined | boolean = useRedux([name, "read_only"]);

    // Kernel usage for status bar
    const { usage, expected_cell_runtime } = useKernelUsage(name);

    // Get compute server ID if available
    const path = props.path;
    const project_id = props.project_id;
    const computeServerId = path
      ? useRedux(["account", "editor_settings", "compute_server_ids"])?.get(
          syncdbPath(path),
        )
      : undefined;

    // Render function for kernel selector
    function render_select_kernel() {
      return <KernelSelector actions={jupyter_actions} />;
    }

    // Render function for editor
    function render_editor() {
      return (
        <div style={EDITOR_CONTAINER_STYLE}>
          <SingleFileEditor
            actions={jupyter_actions}
            editor_actions={props.actions}
            name={name}
            is_focused={props.is_current}
            is_visible={props.is_visible}
            is_fullscreen={props.is_fullscreen}
            font_size={props.font_size}
            project_id={project_id}
            path={path}
          />
        </div>
      );
    }

    // Determine what to show in main content area
    function render_main() {
      if (!check_select_kernel_init) {
        return (
          <Loading
            style={{
              fontSize: "24pt",
              textAlign: "center",
              marginTop: "15px",
              color: COLORS.GRAY,
            }}
          />
        );
      } else if (show_kernel_selector) {
        return render_select_kernel();
      } else {
        return render_editor();
      }
    }

    return (
      <div style={CONTAINER_STYLE}>
        {!read_only && (
          <Kernel
            is_fullscreen={props.is_fullscreen}
            actions={jupyter_actions}
            usage={usage}
            expected_cell_runtime={expected_cell_runtime}
            computeServerId={computeServerId}
          />
        )}
        {render_main()}
      </div>
    );
  },
);

SingleFileView.displayName = "SingleFileView";
