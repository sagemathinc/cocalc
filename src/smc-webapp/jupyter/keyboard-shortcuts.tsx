/*
The keyboard shortcuts and command listing dialog, which:

  - lets you search through all available commands
  - see and change the keyboard shortcuts for those commands\
*/

import { React, Component, Rendered } from "../app-framework";
import { Map } from "immutable";
import * as json from "json-stable-stringify";
import * as misc from "smc-util/misc";
import { Button, Modal } from "react-bootstrap";
import { Icon } from "../r_misc/icon";
const { SearchInput } = require("../r_misc");
import { commands, CommandDescription, KeyboardCommand } from "./commands";
import { evt_to_obj, keyCode_to_chr } from "./keyboard";
import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

// See http://xahlee.info/comp/unicode_computing_symbols.html
const SYMBOLS = {
  meta: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  return: "⏎",
  space: "Space",
  tab: "↹",
  down: "⬇",
  up: "⬆",
  backspace: "⌫"
};

function shortcut_to_string(shortcut: KeyboardCommand): string {
  let s = "";
  if (shortcut.shift) {
    s += SYMBOLS.shift;
  }
  if (shortcut.ctrl) {
    s += SYMBOLS.ctrl;
  }
  if (shortcut.alt) {
    s += SYMBOLS.alt;
  }
  if (shortcut.meta) {
    s += SYMBOLS.meta;
  }
  const keyCode = shortcut.which;
  switch (keyCode) {
    case 8:
      s += SYMBOLS.backspace;
      break;
    case 13:
      s += SYMBOLS.return;
      break;
    case 27:
      s += "Esc";
      break;
    case 40:
      s += SYMBOLS.down;
      break;
    case 38:
      s += SYMBOLS.up;
      break;
    default:
      s += keyCode_to_chr(keyCode);
  }
  if (shortcut.twice) {
    s = s + "," + s;
  }
  return s;
}

interface KeyboardShortcutProps {
  shortcut: KeyboardCommand;
}

export class KeyboardShortcut extends Component<KeyboardShortcutProps> {
  public render(): Rendered {
    return (
      <span style={{ fontFamily: "monospace" }}>
        {shortcut_to_string(this.props.shortcut)}
      </span>
    );
  }
}

const SHORTCUTS_STYLE: React.CSSProperties = {
  width: "20em",
  overflowX: "hidden",
  border: "1px solid transparent",
  paddingRight: "10px"
};

interface ShortcutsProps {
  actions: JupyterActions;
  name: string;
  shortcuts: KeyboardCommand[];
  taken: boolean;
}

interface ShortcutsState {
  hover: boolean;
  add: boolean;
  value: string;
  taken: boolean;
  shortcut?: KeyboardCommand;
}

class Shortcuts extends Component<ShortcutsProps, ShortcutsState> {
  constructor(props: ShortcutsProps, context: any) {
    super(props, context);
    this.state = {
      hover: false,
      add: false,
      value: "",
      taken: false,
      shortcut: undefined
    };
  }

  private edit_shortcut = (e: any): void => {
    e.stopPropagation();
  };

  private render_shortcuts(): Rendered[] {
    const result: Rendered[] = [];
    for (let key in this.props.shortcuts) {
      const shortcut = this.props.shortcuts[key];
      result.push(this.render_shortcut(key, shortcut));
    }
    return result;
  }

  /* TODO: implement this...
  private delete_shortcut = (shortcut: KeyboardCommand): void => {
    this.props.actions.delete_keyboard_shortcut(this.props.name, shortcut);
  };
  private render_shortcut_delete_icon(shortcut: KeyboardCommand) {
    return (
      <Icon
        onClick={(e: any) => {
          e.stopPropagation();
          this.delete_shortcut(shortcut);
        }}
        name="times"
        style={{ color: "#888", paddingLeft: "1ex" }}
      />
    );
  }
  */

  private render_shortcut(key: string, shortcut: KeyboardCommand): Rendered {
    return (
      <span
        key={key}
        style={{ border: "1px solid #999", margin: "2px", padding: "1px" }}
      >
        <KeyboardShortcut key={key} shortcut={shortcut} />
        {
          undefined // this.render_shortcut_delete_icon(shortcut) // disabled for now
        }
      </span>
    );
  }

  private cancel_edit = (): void => {
    this.setState({
      add: false,
      taken: false,
      value: "",
      shortcut: undefined
    });
  };

  private confirm_edit = (): void => {
    this.props.actions.add_keyboard_shortcut(
      this.props.name,
      this.state.shortcut
    );
    this.setState({
      add: false,
      taken: false,
      value: "",
      shortcut: undefined
    });
  };

  private key_down = (e: any): void => {
    if (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      if (e.which === 27) {
        this.cancel_edit();
        return;
      }
    }
    const shortcut = evt_to_obj(e, "escape");
    // Is this shortcut already taken, either in escape mode or both modes?
    let taken = this.props.taken[json(evt_to_obj(e, "edit"))];
    if (taken == null) {
      taken = this.props.taken[json(shortcut)];
    }
    this.setState({
      value: shortcut_to_string(shortcut),
      shortcut,
      taken
    });
  };

  private render_edit_shortcut(): Rendered {
    let bg: string;
    let color: string;
    if (this.state.taken) {
      bg = "red";
      color = "white";
    } else {
      bg = "white";
      color = "black";
    }
    return (
      <input
        style={{ width: "3em", backgroundColor: bg, color }}
        autoFocus={true}
        ref="input"
        type="text"
        value={this.state.value}
        onKeyDown={this.key_down}
      />
    );
  }

  private render_cancel_edit_shortcut(): Rendered {
    return (
      <Icon
        onClick={this.cancel_edit}
        name="times"
        style={{ color: "#888", paddingLeft: "1ex" }}
      />
    );
  }

  private render_confirm_edit_shortcut(): Rendered {
    return (
      <Icon
        onClick={this.confirm_edit}
        name="check"
        style={{ color: "#888", paddingLeft: "1ex" }}
      />
    );
  }

  private render_taken_note(): Rendered {
    return (
      <span style={{ backgroundColor: "#fff" }}>
        <br />
        Shortcut already used by '{this.state.taken}'
      </span>
    );
  }

  public render(): Rendered {
    let { hover } = this.state;
    hover = false; // TODO: editing shortcuts disabled until I implement it!
    return (
      <div
        className="pull-right"
        style={SHORTCUTS_STYLE}
        onClick={this.edit_shortcut}
        onMouseEnter={() => this.setState({ hover: true })}
        onMouseLeave={() => this.setState({ hover: false })}
      >
        {this.render_shortcuts()}
        {hover ? this.render_edit_shortcut() : undefined}
        {hover ? this.render_cancel_edit_shortcut() : undefined}
        {this.state.value && !this.state.taken && hover
          ? this.render_confirm_edit_shortcut()
          : undefined}
        {this.state.taken && hover ? this.render_taken_note() : undefined}
      </div>
    );
  }
}

function capitalize_each_word(s: string): string {
  return misc
    .split(s)
    .map((x: string) => misc.capitalize(x))
    .join(" ");
}

const COMMAND_STYLE = {
  cursor: "pointer",
  borderTop: "1px solid #ccc",
  padding: "5px 0 5px 10px",
  height: "2em"
};

interface CommandProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  name: string;
  desc: string;
  icon?: string;
  shortcuts: KeyboardCommand[];
  taken: boolean;
}

interface CommandState {
  highlight: boolean;
}

class Command extends Component<CommandProps, CommandState> {
  constructor(props: CommandProps, context: any) {
    super(props, context);
    this.state = { highlight: false };
  }

  render_icon() {
    return (
      <span style={{ width: "2em", display: "inline-block" }}>
        {this.props.icon ? <Icon name={this.props.icon} /> : undefined}
      </span>
    );
  }

  run_command = () => {
    this.props.frame_actions.command(this.props.name);
    this.props.actions.close_keyboard_shortcuts();
  };

  on_click = () => {
    this.run_command();
  };

  render_desc() {
    return (
      <span style={{ maxWidth: "20em", overflowX: "hidden" }}>
        {this.props.desc}
      </span>
    );
  }

  render_shortcuts() {
    return (
      <Shortcuts
        actions={this.props.actions}
        shortcuts={this.props.shortcuts}
        name={this.props.name}
        taken={this.props.taken}
      />
    );
  }

  render() {
    let style: React.CSSProperties;
    if (this.state.highlight) {
      style = misc.merge_copy(COMMAND_STYLE, { backgroundColor: "#ddd" });
    } else {
      style = COMMAND_STYLE;
    }
    return (
      <div
        style={style}
        onClick={this.on_click}
        onMouseEnter={() => this.setState({ highlight: true })}
        onMouseLeave={() => this.setState({ highlight: false })}
      >
        {this.render_icon()}
        {this.render_desc()}
        {this.render_shortcuts()}
      </div>
    );
  }
}

const COMMAND_LIST_STYLE: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: "3px",
  overflowY: "scroll",
  maxHeight: "50vh"
};

interface CommandListProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  taken: { [name: string]: boolean };
  search?: string;
}

class CommandList extends Component<CommandListProps> {
  shouldComponentUpdate(nextProps) {
    return nextProps.search !== this.props.search;
  }

  render_commands() {
    const v: any[] = [];
    const obj = commands(this.props.actions, this.props.frame_actions);
    for (let name in obj) {
      const val = obj[name];
      if (val != null) {
        v.push({ name, val });
      }
    }
    v.sort(misc.field_cmp("name"));
    const cmds: any[] = [];
    const search =
      this.props.search != null
        ? this.props.search.toLowerCase() || ""
        : undefined;
    for (let x of v) {
      if (x.val.f == null) {
        continue;
      }
      const desc = x.val.m != null ? x.val.m : capitalize_each_word(x.name);
      if (desc == null) {
        continue;
      }
      if (desc.toLowerCase().indexOf(search) === -1) {
        continue;
      }
      const icon = x.val.i;
      const shortcuts = x.val.k != null ? x.val.k : [];
      cmds.push(
        <Command
          key={x.name}
          name={x.name}
          actions={this.props.actions}
          frame_actions={this.props.frame_actions}
          desc={desc}
          icon={icon}
          shortcuts={shortcuts}
          taken={this.props.taken[x.name]}
        />
      );
    }
    return cmds;
  }

  render() {
    return <div style={COMMAND_LIST_STYLE}>{this.render_commands()}</div>;
  }
}

interface KeyboardShortcutsProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  keyboard_shortcuts?: Map<string, any>;
}

interface KeyboardShortcutsState {
  search: string;
  commands: { [name: string]: CommandDescription };
  taken: { [name: string]: boolean };
}

export class KeyboardShortcuts extends Component<
  KeyboardShortcutsProps,
  KeyboardShortcutsState
> {
  constructor(props: KeyboardShortcutsProps, context: any) {
    super(props, context);
    const obj = {
      search: "",
      commands: commands(this.props.actions, this.props.frame_actions),
      taken: {}
    };
    for (let name in obj.commands) {
      const val = obj.commands[name];
      const arr = (val != null ? val.k : undefined) || [];
      for (let s of arr) {
        obj.taken[json(s)] = val.m || name;
      }
    }
    this.state = obj;
  }

  private close = (): void => {
    this.props.actions.close_keyboard_shortcuts();
    this.props.actions.focus(true);
  };

  private search_change = (search: string): void => {
    this.setState({ search });
  };

  private render_instructions(): Rendered {
    return (
      <div style={{ color: "#666", marginBottom: "10px" }}>
        Click a command to perform it.
        <br />
        NOTE: Keyboard shortcuts are{" "}
        <a
          href="https://github.com/sagemathinc/cocalc/issues/3242"
          target="_blank"
          rel="noopener"
        >
          not yet
        </a>{" "}
        customizable.
        {
          undefined // To add a keyboard shortcut, click plus next to the key combination then type the new keys.
        }
      </div>
    );
  }

  public render(): Rendered {
    if (this.props.keyboard_shortcuts == null) return <span />;
    return (
      <Modal show={true} onHide={this.close} bsSize="large">
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="keyboard-o" /> Commands and keyboard shortcuts
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <SearchInput
            autoFocus={true}
            value={this.state.search}
            on_change={this.search_change}
          />
          {this.render_instructions()}
          <CommandList
            actions={this.props.actions}
            frame_actions={this.props.frame_actions}
            taken={this.state.taken}
            search={this.state.search}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
