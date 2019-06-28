/*
Frame for showing the notebook as a slideshow for presentations.
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class Slideshow extends Component<Props, {}> {
  render(): Rendered {
    return <div>Slideshow version of the notebook -- {this.props.path}</div>;
  }
}
