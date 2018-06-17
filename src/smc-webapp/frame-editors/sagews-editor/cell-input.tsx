import { React, Component, Rendered } from "../generic/react";

interface Props {
  input: string;
}

export class InputCell extends Component<Props, {}> {
  render(): Rendered {
    return <textarea value={this.props.input} onChange={function() {}} />;
  }
}
