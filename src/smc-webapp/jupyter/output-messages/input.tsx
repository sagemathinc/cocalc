/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { React, Component, Rendered, ReactDOM } from "smc-webapp/app-framework";
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

  private async key_down(evt: React.KeyboardEvent): Promise<void> {
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
  }

  private submit(): void {
    if (this.props.actions == null) return;
    this.props.actions.submit_input(this.props.id, this.state.value);
    this.props.actions.focus_unlock();
  }

  public componentDidMount(): void {
    // NOTE! We use autoFocus={false} and focus in componentDidMount because
    // (see https://github.com/sagemathinc/cocalc/issues/4074):
    //    (1) this input could happen at any time (e.g., right in the middle of a loop
    //        after a delay and caused by a different user...)
    //    (2) due to windowing, the input area may be removed and put back in the dom as the
    //        page is scrolled around, and doing autofocus would thus make the page jump
    //        back to the input when ever it is re-rendered (offscreen) in anticipation of
    //        being displayed.
    //    (3) trying to only autofocus "the first time" is insanely hard to get right
    //        when using react with multiple users and not wanting weird hacks/memory leaks.
    //    (4) It's nice having this get focused whenever you scroll it back into view, since
    //        it encourages the users to put something in the input.
    //    (5) That said, it would be nice to have some global message somewhere that warns
    //        the user that execution is blocked until a certain input is answered, with a button
    //        to jump to that input.  That could tie into a global state indicator of which
    //        cell is currently running.  But that's outside the scope of this code.
    const elt = ReactDOM.findDOMNode(this.refs.input);
    if (elt == null) return;
    elt.focus({ preventScroll: true });
  }

  render(): Rendered {
    return (
      <div style={STDOUT_STYLE}>
        {this.props.message.getIn(["opts", "prompt"], "")}
        <input
          style={INPUT_STYLE}
          autoFocus={false}
          readOnly={this.props.actions == null}
          type={
            this.props.message.getIn(["opts", "password"]) ? "password" : "text"
          }
          ref="input"
          size={Math.max(47, this.state.value.length + 10)}
          value={this.state.value}
          onChange={(e: any) => this.setState({ value: e.target.value })}
          onBlur={() => {
            if (this.props.actions != null) {
              this.props.actions.focus_unlock();
            }
          }}
          onFocus={() => {
            if (this.props.actions != null) {
              this.props.actions.blur_lock();
            }
          }}
          onKeyDown={this.key_down.bind(this)}
        />
      </div>
    );
  }
}
