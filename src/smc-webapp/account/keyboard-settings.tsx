/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../app-framework";
import { Icon, LabeledRow, Loading, SelectorInput } from "../r_misc";
import { Panel } from "../antd-bootstrap";
import { set_account_table } from "./util";

const KEYBOARD_SHORTCUTS = {
  //'Next file tab'                : 'control+]'  # temporarily disabled since broken in many ways
  //'Previous file tab'            : 'control+['
  "Build project / run code": "shift+enter; alt+T; command+T",
  "Force build project": "shift+alt+enter; shift+alt+T; shift+command+T",
  "LaTeX forward sync": "alt+enter; cmd+enter",
  "Smaller text": "control+<",
  "Bigger text": "control+>",
  "Toggle comment": "control+/",
  "Go to line": "control+L",
  Find: "control+F",
  "Find next": "control+G",
  "Fold/unfold selected code": "control+Q",
  "Fill paragraph (like in Emacs)": "alt+Q; cmd+Q",
  "Shift selected text right": "tab",
  "Shift selected text left": "shift+tab",
  "Split view in Sage worksheet": "shift+control+I",
  "Autoindent selection": "control+'",
  "Format code (use Prettier, etc)": "control+shift+F",
  "Multiple cursors": "control+click",
  "Simple autocomplete": "control+space",
  "Sage autocomplete": "tab",
  "Split cell in Sage worksheet": "control+;",
};

const EVALUATE_KEYS = {
  "Shift-Enter": "shift+enter",
  Enter: "enter (shift+enter for newline)",
};

export const KeyboardSettings: React.FC = () => {
  const evaluate_key = useTypedRedux("account", "evaluate_key");

  function render_keyboard_shortcuts(): JSX.Element[] {
    const v: JSX.Element[] = [];
    for (const desc in KEYBOARD_SHORTCUTS) {
      const shortcut = KEYBOARD_SHORTCUTS[desc];
      v.push(
        <LabeledRow key={desc} label={desc}>
          {shortcut}
        </LabeledRow>
      );
    }
    return v;
  }

  function eval_change(value): void {
    set_account_table({ evaluate_key: value });
  }

  function render_eval_shortcut(): JSX.Element {
    if (evaluate_key == null) {
      return <Loading />;
    }
    return (
      <LabeledRow label="Sage Worksheet evaluate key">
        <SelectorInput
          options={EVALUATE_KEYS}
          selected={evaluate_key}
          on_change={eval_change}
        />
      </LabeledRow>
    );
  }

  return (
    <Panel
      header={
        <>
          <Icon name="keyboard-o" /> Keyboard shortcuts
        </>
      }
    >
      {render_keyboard_shortcuts()}
      {render_eval_shortcut()}
    </Panel>
  );
};
