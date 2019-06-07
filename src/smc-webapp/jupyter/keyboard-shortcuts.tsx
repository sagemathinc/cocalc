/*
The keyboard shortcuts and command listing dialog, which:

  - lets you search through all available commands
  - see and change the keyboard shortcuts for those commands\
*/

import { React, Component, Rendered } from "../app-framework";
import { Map } from "immutable";
import * as json from "json-stable-stringify";
import * as misc from "smc-util/misc";
import { Button, Modal, Grid, Row, Col } from "react-bootstrap";
import { Icon } from "../r_misc/icon";
const { SearchInput, r_join } = require("../r_misc");
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
  space: "⌴",
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
    case 32:
      s += SYMBOLS.space;
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

  private render_shortcuts(): Rendered {
    const result: Rendered[] = [];
    for (let key in this.props.shortcuts) {
      const shortcut = this.props.shortcuts[key];
      result.push(this.render_shortcut(key, shortcut));
    }
    return r_join(result, ", ");
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
  padding: "5px 0 5px 10px"
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

  private render_icon(): Rendered {
    return (
      <span>
        {this.props.icon ? <Icon name={this.props.icon} /> : undefined}
      </span>
    );
  }

  private run_command = () => {
    this.props.frame_actions.command(this.props.name);
    this.props.actions.close_keyboard_shortcuts();
  };

  private on_click = () => {
    this.run_command();
  };

  private render_desc(): Rendered {
    return <span>{this.props.desc}</span>;
  }

  private render_shortcuts(): Rendered {
    return (
      <Shortcuts
        actions={this.props.actions}
        shortcuts={this.props.shortcuts}
        name={this.props.name}
        taken={this.props.taken}
      />
    );
  }

  public render(): Rendered {
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
        <Grid style={{ width: "100%" }}>
          <Row>
            <Col md={1} sm={1}>{this.render_icon()}</Col>
            <Col md={7} sm={7}>{this.render_desc()}</Col>
            <Col md={4} sm={4}>{this.render_shortcuts()}</Col>
          </Row>
        </Grid>
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

  private render_commands(): Rendered[] {
    const v: any[] = [];
    const obj = commands(this.props.actions, this.props.frame_actions);
    for (let name in obj) {
      const val = obj[name];
      if (val != null) {
        v.push({ name, val });
      }
    }
    v.sort(misc.field_cmp("name"));
    const cmds: Rendered[] = [];
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

  public render(): Rendered {
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

  private render_symbols(): Rendered {
    return <ul style={{ marginTop: "30px" }}>{this.render_symbols_list()}</ul>;
  }

  private render_symbols_list(): Rendered[] {
    const v: Rendered[] = [];
    for (let key in SYMBOLS) {
      v.push(
        <li key={key}>
          <span style={{ width: "20px", display: "inline-block" }}>
            {SYMBOLS[key]}
          </span>{" "}
          {key}
        </li>
      );
    }
    return v;
  }

  private render_heading(): Rendered {
    return (
      <Grid style={{ width: "100%", fontWeight: "bold", color: "#666" }}>
        <Row>
          <Col md={1} sm={1}/>
          <Col md={7} sm={7}>Command (click to run)</Col>
          <Col md={4} sm={4}>Keyboard shortcut</Col>
        </Row>
      </Grid>
    );
  }

  /*
  private render_instructions(): Rendered {
    return (
      <div style={{ color: "#666", marginBottom: "10px" }}>
        NOTE: Keyboard shortcuts are{" "}
        <a
          href="https://github.com/sagemathinc/cocalc/issues/3242"
          target="_blank"
          rel="noopener"
        >
          not yet
        </a>{" "}
        customizable.}
        {//To add a keyboard shortcut, click plus next to the key combination then type the new keys.
        }
      </div>
    );
  }
  */

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
          <Grid style={{ width: "100%" }}>
            <Row>
              <Col md={12}>
                <SearchInput
                  autoFocus={true}
                  value={this.state.search}
                  on_change={this.search_change}
                  placeholder={"Search commands..."}
                />
              </Col>
            </Row>
            <Row>
              <Col md={9}>
                {this.render_heading()}
                <CommandList
                  actions={this.props.actions}
                  frame_actions={this.props.frame_actions}
                  taken={this.state.taken}
                  search={this.state.search}
                />
              </Col>
              <Col md={3}>{this.render_symbols()}</Col>
            </Row>
          </Grid>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
}
