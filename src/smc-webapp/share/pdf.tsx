/*
Embedded PDF viewer.
*/

import { Component, React, Rendered } from "../app-framework";

interface Props {
  src: string;
}

export class PDF extends Component<Props> {
  public render(): Rendered {
    return (
      <embed
        width="100%"
        height="100%"
        src={this.props.src}
        type="application/pdf"
      />
    );
  }
}
