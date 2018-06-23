/*
The keyboard shortcuts and command listing dialog, which:

  - lets you search through all available commands
  - see and change the keyboard shortcuts for those commands\
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";
const json = require("json-stable-stringify");
const misc = require("smc-util/misc");
const { Button, Modal } = require("react-bootstrap");
const { Icon, SearchInput } = require("../r_misc");
const commands = require("./commands");
const keyboard = require("./keyboard");

const SYMBOLS = {
  meta: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  return: "↩",
  space: "Space",
  tab: "⇥",
  down: "down",
  up: "up",
  backspace: "BS",
};

function shortcut_to_string(shortcut: any) {
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
      s += keyboard.keyCode_to_chr(keyCode);
  }
  if (shortcut.twice) {
    s = s + "," + s;
  }
  return s;
}

interface KeyboardShortcutProps {
  shortcut: any;
}

export class KeyboardShortcut extends Component<KeyboardShortcutProps> {
  render() {
    return (
      <span style={{ fontFamily: "monospace" }}>{shortcut_to_string(this.props.shortcut)}</span>
    );
  }
}

const SHORTCUTS_STYLE: React.CSSProperties = {
  width: "20em",
  overflowX: "hidden",
  border: "1px solid transparent",
  paddingRight: "10px",
};

interface ShortcutsProps {
  actions: any;
  name: string;
  shortcuts: any[];
  taken: any;
}

interface ShortcutsState {
  hover: boolean;
  add: boolean;
  value: string;
  taken: boolean;
  shortcut: undefined | any;
}

class Shortcuts extends Component<ShortcutsProps, ShortcutsState> {
  constructor(props: ShortcutsProps, context: any) {
    super(props, context);
    this.state = {
      hover: false,
      add: false,
      value: "",
      taken: false,
      shortcut: undefined,
    };
  }

  edit_shortcut = (e: any) => {
    e.stopPropagation();
  };

  delete_shortcut = (shortcut: any) => {
    this.props.actions.delete_keyboard_shortcut(this.props.name, shortcut);
  };

  render_shortcuts() {
    const result: any[] = [];
    for (let key in this.props.shortcuts) {
      const shortcut = this.props.shortcuts[key];
      result.push(this.render_shortcut(key, shortcut));
    }
    return result;
  }

  render_shortcut_delete_icon(shortcut: any) {
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

  render_shortcut(key: any, shortcut: any) {
    return (
      <span key={key} style={{ border: "1px solid #999", margin: "2px", padding: "1px" }}>
        <KeyboardShortcut key={key} shortcut={shortcut} />
        {
          undefined // this.render_shortcut_delete_icon(shortcut) // disabled for now
        }
      </span>
    );
  }

  cancel_edit = () => {
    return this.setState({ add: false, taken: false, value: "", shortcut: undefined });
  };

  confirm_edit = () => {
    this.props.actions.add_keyboard_shortcut(this.props.name, this.state.shortcut);
    return this.setState({ add: false, taken: false, value: "", shortcut: undefined });
  };

  key_down = (e: any) => {
    if (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      if (e.which === 27) {
        this.cancel_edit();
        return;
      }
    }
    const shortcut = keyboard.evt_to_obj(e, "escape");
    // Is this shortcut already taken, either in escape mode or both modes.
    let taken = this.props.taken[json(keyboard.evt_to_obj(e))];
    if (taken == null) {
      taken = this.props.taken[json(shortcut)];
    }
    return this.setState({
      value: shortcut_to_string(shortcut),
      shortcut,
      taken,
    });
  };

  render_edit_shortcut() {
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

  render_cancel_edit_shortcut() {
    return (
      <Icon
        onClick={e => {
          e.stopPropagation();
          return this.cancel_edit();
        }}
        name="times"
        style={{ color: "#888", paddingLeft: "1ex" }}
      />
    );
  }

  render_confirm_edit_shortcut() {
    return (
      <Icon
        onClick={e => {
          e.stopPropagation();
          return this.confirm_edit();
        }}
        name="check"
        style={{ color: "#888", paddingLeft: "1ex" }}
      />
    );
  }

  render_taken_note() {
    return (
      <span style={{ backgroundColor: "#fff" }}>
        <br />
        Shortcut already used by '{this.state.taken}'
      </span>
    );
  }

  render() {
    let { hover } = this.state;
    hover = false; // editing shortcuts disabled until #v2
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

function capitalize(s: string) {
  return misc
    .split(s)
    .map((x: any) => misc.capitalize(x))
    .join(" ");
}

const COMMAND_STYLE = {
  cursor: "pointer",
  borderTop: "1px solid #ccc",
  padding: "5px 0 5px 10px",
  height: "2em",
};

interface CommandProps {
  actions: any;
  name: string;
  desc: string;
  icon?: string;
  shortcuts: any[];
  taken: any;
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
    this.props.actions.command(this.props.name);
    this.props.actions.close_keyboard_shortcuts();
  };

  on_click = () => {
    this.run_command();
  };

  render_desc() {
    return <span style={{ maxWidth: "20em", overflowX: "hidden" }}>{this.props.desc}</span>;
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
  maxHeight: "50vh",
};

interface CommandListProps {
  actions: any;
  taken: any;
  search?: string;
}

class CommandList extends Component<CommandListProps> {
  shouldComponentUpdate(nextProps) {
    return nextProps.search !== this.props.search;
  }

  render_commands() {
    const v: any[] = [];
    const obj = commands.commands();
    for (let name in obj) {
      const val = obj[name];
      if (val != null) {
        v.push({ name, val });
      }
    }
    v.sort(misc.field_cmp("name"));
    const cmds: any[] = [];
    const search = this.props.search != null ? this.props.search.toLowerCase() || "" : undefined;
    for (let x of v) {
      if (x.val.f == null) {
        continue;
      }
      const desc = x.val.m != null ? x.val.m : capitalize(x.name);
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
          desc={desc}
          icon={icon}
          shortcuts={shortcuts}
          taken={this.props.taken}
        />,
      );
    }
    return cmds;
  }

  render() {
    return <div style={COMMAND_LIST_STYLE}>{this.render_commands()}</div>;
  }
}

interface KeyboardShortcutsProps {
  actions: any;
  keyboard_shortcuts?: ImmutableMap<any, any>;
}

interface KeyboardShortcutsState {
  search: string;
  commands: any;
  taken: any;
}

export class KeyboardShortcuts extends Component<KeyboardShortcutsProps, KeyboardShortcutsState> {
  constructor(props: KeyboardShortcutsProps, context: any) {
    super(props, context);
    const obj = { search: "", commands: commands.commands(), taken: {} };
    for (let name in obj.commands) {
      const val = obj.commands[name];
      const arr = (val != null ? val.k : undefined) || [];
      for (let s of arr) {
        obj.taken[json(s)] = val.m || name;
      }
    }
    this.state = obj;
  }

  close = () => {
    this.props.actions.close_keyboard_shortcuts();
    this.props.actions.focus(true);
  };

  search_change = (search: string) => {
    this.setState({ search });
  };

  render_instructions() {
    return (
      <div style={{ color: "#666", marginBottom: "10px" }}>
        Click a command to perform it.
        <br />
        NOTE: Keyboard shortcuts are not customizable yet.
        {
          undefined // To add a keyboard shortcut, click plus next to the key combination then type the new keys.
        }
      </div>
    );
  }

  render() {
    return (
      <Modal
        show={
          this.props.keyboard_shortcuts != null
            ? this.props.keyboard_shortcuts.get("show")
            : undefined
        }
        onHide={this.close}
        bsSize="large"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="keyboard-o" /> Commands and keyboard shortcuts
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <SearchInput autoFocus={true} value={this.state.search} on_change={this.search_change} />
          {this.render_instructions()}
          <CommandList
            actions={this.props.actions}
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
