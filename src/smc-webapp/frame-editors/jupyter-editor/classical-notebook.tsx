/*
Frame for showing the notebook as a slideshow for presentations.
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class ClassicalNotebook extends Component<Props, {}> {
  render(): Rendered {
    return <div>Classical version of the notebook in an iframe with sync (?) -- {this.props.path}</div>;
  }
}
