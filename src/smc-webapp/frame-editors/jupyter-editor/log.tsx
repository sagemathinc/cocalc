/*
Frame that displays the log for a Jupyter Notebook
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class Log extends Component<Props, {}> {
  render(): Rendered {
    return <div>Jupyter Kernel Log for {this.props.path}</div>;
  }
}
