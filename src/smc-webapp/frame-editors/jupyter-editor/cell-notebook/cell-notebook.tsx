/*
Frame that display a Jupyter notebook in the traditional way with input and output cells.
*/

import { Loading } from "../../../r_misc/loading";

import { React, Rendered, Component } from "../../../app-framework";

import { JupyterEditor } from "../../../jupyter/main";

import { redux_name } from "./jupyter-actions";

interface Props {
  id: string;
  name: string;
  actions: any;
  editor_state: Map<string, any>;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  font_size: number;
}

export class CellNotebook extends Component<Props, {}> {
  render(): Rendered {
    const name = redux_name(this.props.name, this.props.id);
    const actions = this.props.actions.redux.getActions(name);
    if (actions == null) {
      return <Loading />;
    }
    return <JupyterEditor actions={actions} name={name} />;
  }
}
