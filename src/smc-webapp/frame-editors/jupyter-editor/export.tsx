/*
Frame for exporting notebook to some other format (mainly using nbconvert).
*/

import { React, Rendered, Component } from "../../app-framework";

interface Props {
  project_id: string;
  path: string;
  font_size: number;
}

export class Export extends Component<Props, {}> {
  render(): Rendered {
    return (
      <div>
        Exporting notebook to other formats (nbconvert) -- {this.props.path}
      </div>
    );
  }
}
