/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { React, ReactDOM, useState, useRef } from "@cocalc/frontend/app-framework";
import { Map } from "immutable";
import { INPUT_STYLE, STDOUT_STYLE } from "./style";
import { JupyterActions } from "../browser-actions";

interface InputProps {
  message: Map<string, any>;
  actions?: JupyterActions;
  id: string;
}

export const Input: React.FC<InputProps> = (props: InputProps) => {
  const { message, actions, id } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const [value, set_value] = useState("");

  // NOTE! We use autoFocus={false} and focus in upon mounting because
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
  React.useEffect(() => {
    const elt = ReactDOM.findDOMNode(inputRef.current);
    if (elt == null) return;
    elt.focus({ preventScroll: true });
  }, []);

  async function key_down(evt: React.KeyboardEvent): Promise<void> {
    if (evt.keyCode === 13) {
      evt.stopPropagation();
      submit();
    }
    // Official docs: If the user hits EOF (*nix: Ctrl-D, Windows: Ctrl-Z+Return),
    // raise EOFError.
    // The Jupyter notebook does *NOT* properly implement this.  We do
    // something at least similar and send an interrupt on
    // control d or control z.
    if ((evt.keyCode === 68 || evt.keyCode === 90) && evt.ctrlKey) {
      evt.stopPropagation();
      actions?.signal("SIGINT");
      await delay(10);
      submit();
    }
  }

  function submit(): void {
    if (actions == null) return;
    actions.submit_input(id, value);
    actions.focus_unlock();
  }

  return (
    <div style={STDOUT_STYLE}>
      {message.getIn(["opts", "prompt"], "")}
      <input
        style={INPUT_STYLE}
        autoFocus={false}
        readOnly={actions == null}
        type={message.getIn(["opts", "password"]) ? "password" : "text"}
        ref={inputRef}
        size={Math.max(47, value.length + 10)}
        value={value}
        onChange={(e: any) => set_value(e.target.value)}
        onBlur={() => {
          if (actions != null) {
            actions.focus_unlock();
          }
        }}
        onFocus={() => {
          if (actions != null) {
            actions.blur_lock();
          }
        }}
        onKeyDown={key_down}
      />
    </div>
  );
};
