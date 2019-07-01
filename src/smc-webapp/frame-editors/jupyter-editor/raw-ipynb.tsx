/*
Frame that displays the log for a Jupyter Notebook
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class RawIPynb extends Component<Props, {}> {
  render(): Rendered {
    return <div>Raw IPynb View -- {this.props.path}</div>;
  }
}
