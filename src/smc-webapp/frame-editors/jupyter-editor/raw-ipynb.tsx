/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame that displays the log for a Jupyter Notebook
*/

import { React, Rendered, Component } from "../../app-framework";

import { RawEditor } from "../../jupyter/raw-editor";

import { JupyterEditorActions } from "./actions";

import { Map, fromJS } from "immutable";
import { cm_options } from "../codemirror/cm-options";

interface Props {
  actions: JupyterEditorActions;
  font_size: number;
  editor_settings: Map<string, any>;
}

export class RawIPynb extends Component<Props, {}> {
  public render(): Rendered {
    return (
      <RawEditor
        name={this.props.actions.jupyter_actions.name}
        actions={this.props.actions.jupyter_actions}
        font_size={this.props.font_size}
        raw_ipynb={Map({ foo: "bar" })}
        cm_options={fromJS(cm_options("a.json", this.props.editor_settings))}
      />
    );
  }
}
