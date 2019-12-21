/*
Rendering a Sage worksheet cell
*/

import { React, Component, Rendered } from "../app-framework";

import { CellInput } from "./input";
import { CellOutput } from "./output";

interface Props {
  input: string;
  output: object;
  flags: string;
}

export class Cell extends Component<Props> {
  private render_input(): Rendered {
    return <CellInput input={this.props.input} flags={this.props.flags} />;
  }

  private render_output(): Rendered {
    if (this.props.output != null) {
      return <CellOutput output={this.props.output} flags={this.props.flags} />;
    }
  }

  public render(): Rendered {
    return (
      <div>
        {this.render_input()}
        {this.render_output()}
      </div>
    );
  }
}
