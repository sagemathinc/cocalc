import { React, Component, Rendered } from "smc-webapp/app-framework";
import { STDOUT_STYLE } from "./style";

interface TextPlainProps {
  value: string;
}

export class TextPlain extends Component<TextPlainProps> {
  render() : Rendered {
    // span? -- see https://github.com/sagemathinc/cocalc/issues/1958
    return (
      <div style={STDOUT_STYLE}>
        <span>{this.props.value}</span>
      </div>
    );
  }
}
