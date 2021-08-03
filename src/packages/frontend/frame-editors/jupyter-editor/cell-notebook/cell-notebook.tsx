/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame that display a Jupyter notebook in the traditional way with input and output cells.
*/

import { Loading } from "../../../r_misc";

import { React, Rendered, Component } from "../../../app-framework";

import { JupyterEditor } from "../../../jupyter/main";

import { Map } from "immutable";
import { JupyterEditorActions } from "../actions";
import { JupyterActions } from "../../../jupyter/browser-actions";
import { EditorState } from "../../frame-tree/types";

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
  desc: Map<string, any>;
}

export class CellNotebook extends Component<Props, {}> {
  private data(key: string, def?: any): any {
    return this.props.desc.get("data-" + key, def);
  }

  render(): Rendered {
    // Actions for the underlying Jupyter notebook state, kernel state, etc.
    const jupyter_actions: JupyterActions = this.props.actions.jupyter_actions;
    // Actions specific to a particular frame view of the notebook
    // in the browser client.
    const frame_actions = this.props.actions.get_frame_actions(this.props.id);
    if (frame_actions == null) {
      return <Loading />;
    }
    return (
      <JupyterEditor
        actions={jupyter_actions}
        editor_actions={this.props.actions}
        frame_actions={frame_actions}
        name={jupyter_actions.name}
        is_focused={this.props.is_current}
        is_fullscreen={this.props.is_fullscreen}
        font_size={this.props.font_size}
        mode={this.data("mode", "escape")}
        cur_id={this.data("cur_id")}
        sel_ids={this.data("sel_ids")}
        md_edit_ids={this.data("md_edit_ids")}
        scroll={this.data("scroll")}
        scrollTop={this.data("scrollTop")}
        hook_offset={this.data("hook_offset")}
      />
    );
  }
}
