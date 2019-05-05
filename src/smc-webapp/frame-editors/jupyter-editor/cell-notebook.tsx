/*
Frame that display a Jupyter notebook in the traditional way with input and output cells.
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  id: string;
  actions: any;
  editor_state: Map<string, any>;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  font_size: number;
}

export class CellNotebook extends Component<Props, {}> {
  render(): Rendered {
    return <div>A Jupyter Notebook {this.props.path}</div>;
  }
}
