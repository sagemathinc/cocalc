import { delay } from "awaiting";
import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { INPUT_STYLE, STDOUT_STYLE } from "./style";
import { JupyterActions } from "../browser-actions";

interface InputProps {
  message: Map<string, any>;
  actions?: JupyterActions;
  id: string;
}

interface InputState {
  value: string;
}

export class Input extends Component<InputProps, InputState> {
  constructor(props: InputProps, context: any) {
    super(props, context);
    this.state = { value: "" };
  }

  key_down = async (evt: React.KeyboardEvent): Promise<void> => {
    if (evt.keyCode === 13) {
      evt.stopPropagation();
      this.submit();
    }
    // Official docs: If the user hits EOF (*nix: Ctrl-D, Windows: Ctrl-Z+Return),
    // raise EOFError.
    // The Jupyter notebook does *NOT* properly implement this.  We do
    // something at least similar and send an interrupt on
    // control d or control z.
    if ((evt.keyCode === 68 || evt.keyCode === 90) && evt.ctrlKey) {
      evt.stopPropagation();
      if (this.props.actions != null) {
        this.props.actions.signal("SIGINT");
      }
      await delay(10);
      this.submit();
    }
  };

  submit = (): void => {
    if (this.props.actions == null) return;
    this.props.actions.submit_input(this.props.id, this.state.value);
    this.props.actions.focus_unlock();
  };

  render(): Rendered {
    return (
      <div style={STDOUT_STYLE}>
        {this.props.message.getIn(["opts", "prompt"], "")}
        <input
          style={INPUT_STYLE}
          autoFocus={true}
          readOnly={this.props.actions == null}
          type={
            this.props.message.getIn(["opts", "password"]) ? "password" : "text"
          }
          ref="input"
          size={Math.max(47, this.state.value.length + 10)}
          value={this.state.value}
          onChange={(e: any) => this.setState({ value: e.target.value })}
          onBlur={
            this.props.actions != null
              ? this.props.actions.focus_unlock
              : undefined
          }
          onFocus={
            this.props.actions != null
              ? this.props.actions.blur_lock
              : undefined
          }
          onKeyDown={this.key_down}
        />
      </div>
    );
  }
}
