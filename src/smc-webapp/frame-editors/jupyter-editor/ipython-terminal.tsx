/*
Frame for working with a command line terminal connected to the
underlying kernel.
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class IPythonTerminal extends Component<Props, {}> {
  render(): Rendered {
    return <div>IPython Terminal connected to underlying kernel -- {this.props.path}</div>;
  }
}
