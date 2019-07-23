/*
Frame that displays the log for a Jupyter Notebook
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class ObjectBrowser extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>Jupyter Notebook Object Browser View for {this.props.path}</div>
    );
  }
}
