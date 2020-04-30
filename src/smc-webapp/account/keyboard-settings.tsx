import { Component, React, Rendered } from "../app-framework";
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

interface Props {
  evaluate_key?: string;
}

export class KeyboardSettings extends Component<Props> {
  private render_keyboard_shortcuts(): Rendered[] {
    const v: Rendered[] = [];
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

  private eval_change(value): void {
    set_account_table({ evaluate_key: value });
  }

  private render_eval_shortcut(): Rendered {
    if (this.props.evaluate_key == null) {
      return <Loading />;
    }
    return (
      <LabeledRow label="Sage Worksheet evaluate key">
        <SelectorInput
          options={EVALUATE_KEYS}
          selected={this.props.evaluate_key}
          on_change={this.eval_change}
        />
      </LabeledRow>
    );
  }

  public render(): Rendered {
    return (
      <Panel
        header={
          <>
            <Icon name="keyboard-o" /> Keyboard shortcuts
          </>
        }
      >
        {this.render_keyboard_shortcuts()}
        {this.render_eval_shortcut()}
      </Panel>
    );
  }
}
