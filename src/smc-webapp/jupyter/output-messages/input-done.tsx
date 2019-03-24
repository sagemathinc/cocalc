import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { INPUT_STYLE, STDOUT_STYLE } from "./style";

interface InputDoneProps {
  message: Map<string, any>;
}

export class InputDone extends Component<InputDoneProps> {
  render(): Rendered {
    const value: string = this.props.message.getIn(["opts", "prompt"], "");
    return (
      <div style={STDOUT_STYLE}>
        {value}
        <input
          style={INPUT_STYLE}
          type={
            this.props.message.getIn(["opts", "password"]) ? "password" : "text"
          }
          size={Math.max(47, value.length + 10)}
          readOnly={true}
          value={this.props.message.get("value", "")}
        />
      </div>
    );
  }
}
