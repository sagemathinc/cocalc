/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../app-framework";
import { Icon, LabeledRow, Loading, SelectorInput } from "../r_misc";
import { Panel } from "../antd-bootstrap";
import { set_account_table } from "./util";
import { IS_MACOS } from "../feature";

const KEYBOARD_SHORTCUTS = {
  //'Next file tab'                : 'control+]'  # temporarily disabled since broken in many ways
  //'Previous file tab'            : 'control+['
  "Build project / run code": IS_MACOS
    ? "shift+enter; option+T"
    : "shift+enter; alt+T",
  "Force build project": IS_MACOS
    ? "shift+option+enter; shift+option+T"
    : "shift+alt+enter; shift+alt+T",
  "LaTeX and markdown forward and inverse search": IS_MACOS
    ? "⌘+enter"
    : "alt+enter",
  "Smaller text": "control+<",
  "Bigger text": "control+>",
  "Toggle comment": "control+/",
  "Go to line": IS_MACOS ? "⌘+L" : "control+L",
  Find: IS_MACOS ? "⌘+F" : "control+F",
  "Find next": IS_MACOS ? "⌘+G" : "control+G",
  Replace: IS_MACOS ? "⌘+H" : "control+H",
  "Fold/unfold selected code": "control+Q",
  "Fill paragraph (like in Emacs)": IS_MACOS ? "option+Q" : "alt+Q",
  "Shift selected text right": "tab",
  "Shift selected text left": "shift+tab",
  "Split view in Sage worksheet": "shift+control+I",
  "Autoindent selection": "control+'",
  "Format code (use Prettier, etc)": IS_MACOS ? "⌘+shift+F" : "control+shift+F",
  "Multiple cursors": IS_MACOS ? "⌘+click" : "control+click",
  "LaTeX (etc) simple autocomplete": IS_MACOS
    ? "option+space"
    : "control+space",
  "Sage autocomplete": "tab",
  "Split cell in Sage worksheet": "control+;",
};

const EVALUATE_KEYS = {
  "Shift-Enter": "shift+enter",
  Enter: "enter (shift+enter for newline)",
};

const LABEL_COLS=8;

export const KeyboardSettings: React.FC = () => {
  const evaluate_key = useTypedRedux("account", "evaluate_key");

  function render_keyboard_shortcuts(): JSX.Element[] {
    const v: JSX.Element[] = [];
    for (const desc in KEYBOARD_SHORTCUTS) {
      const shortcut = KEYBOARD_SHORTCUTS[desc];
      v.push(
        <LabeledRow key={desc} label={desc} label_cols = {LABEL_COLS}>
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
      <LabeledRow label="Sage Worksheet evaluate key"  label_cols = {LABEL_COLS}>
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
          <Icon name="keyboard" /> Keyboard shortcuts
        </>
      }
    >
      {render_keyboard_shortcuts()}
      {render_eval_shortcut()}
    </Panel>
  );
};
