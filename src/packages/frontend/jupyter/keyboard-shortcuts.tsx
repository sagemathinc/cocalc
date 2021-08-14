/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The keyboard shortcuts and command listing dialog, which:
//
//   - lets you search through all available commands
//   - see and change the keyboard shortcuts for those commands\

import { React, Rendered, useState } from "../app-framework";
import { Map } from "immutable";
import * as json from "json-stable-stringify";
import { capitalize, copy_without, field_cmp, split } from "@cocalc/util/misc";
import { Button, Modal, Grid, Row, Col } from "react-bootstrap";
import { A, Icon, IconName, SearchInput, r_join } from "../components";
import {
  commands as create_commands,
  CommandDescription,
  KeyboardCommand,
} from "./commands";
import { evt_to_obj, keyCode_to_chr } from "./keyboard";
import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";
import { JupyterEditorActions } from "../frame-editors/jupyter-editor/actions";
const { ShowSupportLink } = require("../support");

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
  backspace: "⌫",
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
  if (shortcut.key) {
    s += shortcut.key;
  } else {
    // TODO: using which is buggy/horrible/confusing/deprecated!
    // we should get rid of this...
    const keyCode = shortcut.which;
    if (keyCode != null) {
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
    }
  }
  if (shortcut.twice) {
    s = s + "," + s;
  }
  return s;
}

interface KeyboardShortcutProps {
  shortcut: KeyboardCommand;
}

export const KeyboardShortcut: React.FC<KeyboardShortcutProps> = (
  props: KeyboardShortcutProps
) => {
  const { shortcut } = props;

  return (
    <span style={{ fontFamily: "monospace" }}>
      {shortcut_to_string(shortcut)}
    </span>
  );
};

const SHORTCUTS_STYLE: React.CSSProperties = {
  border: "1px solid transparent",
  paddingRight: "10px",
} as const;

interface ShortcutsProps {
  actions: JupyterActions;
  name: string;
  shortcuts: KeyboardCommand[];
  taken: string;
}

const Shortcuts: React.FC<ShortcutsProps> = React.memo(
  (props: ShortcutsProps) => {
    const { actions, name, shortcuts, taken: prop_taken } = props;

    // TODO: editing shortcuts disabled until @ws implements it!
    const [hover, set_hover] = useState<boolean>(false);
    //const [add, set_add] = useState<boolean>(false);
    const [value, set_value] = useState<string>("");
    const [taken, set_taken] = useState<string | undefined>(undefined);
    const [shortcut, set_shortcut] = useState<
      ReturnType<typeof evt_to_obj> | undefined
    >(undefined);

    function edit_shortcut(e: any): void {
      e.stopPropagation();
    }

    function render_shortcuts(): Rendered[] {
      const result: Rendered[] = [];
      for (const key in shortcuts) {
        const shortcut = shortcuts[key];
        result.push(render_shortcut(key, shortcut));
      }
      return r_join(result, ", ");
    }

    /* TODO: implement this...
  function delete_shortcut = (shortcut: KeyboardCommand): void => {
    actions.delete_keyboard_shortcut(name, shortcut);
  };
  function render_shortcut_delete_icon(shortcut: KeyboardCommand) {
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

    function render_shortcut(key: string, shortcut: KeyboardCommand): Rendered {
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

    function cancel_edit(): void {
      //set_add(false);
      set_taken(undefined);
      set_value("");
      set_shortcut(undefined);
    }

    function confirm_edit(): void {
      actions.add_keyboard_shortcut(name, shortcut);
      cancel_edit();
    }

    function key_down(e: any): void {
      if (!e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.which === 27) {
          cancel_edit();
          return;
        }
      }
      const shortcut = evt_to_obj(e, "escape");
      // Is this shortcut already taken, either in escape mode or both modes?
      let taken = prop_taken[json(evt_to_obj(e, "edit"))];
      if (taken == null) {
        taken = prop_taken[json(shortcut)];
      }
      set_value(shortcut_to_string(shortcut));
      set_shortcut(shortcut);
      set_taken(taken);
    }

    function render_edit_shortcut(): Rendered {
      let bg: string;
      let color: string;
      if (taken) {
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
          value={value}
          onKeyDown={key_down}
        />
      );
    }

    function render_cancel_edit_shortcut(): Rendered {
      return (
        <Icon
          onClick={cancel_edit}
          name="times"
          style={{ color: "#888", paddingLeft: "1ex" }}
        />
      );
    }

    function render_confirm_edit_shortcut(): Rendered {
      return (
        <Icon
          onClick={confirm_edit}
          name="check"
          style={{ color: "#888", paddingLeft: "1ex" }}
        />
      );
    }

    function render_taken_note(): Rendered {
      return (
        <span style={{ backgroundColor: "#fff" }}>
          <br />
          Shortcut already used by '{taken}'
        </span>
      );
    }

    // TODO: editing shortcuts disabled until @ws implements it!
    const enable_hover = hover && false;
    return (
      <div
        style={SHORTCUTS_STYLE}
        onClick={edit_shortcut}
        onMouseEnter={() => set_hover(true)}
        onMouseLeave={() => set_hover(false)}
      >
        {render_shortcuts()}
        {enable_hover ? render_edit_shortcut() : undefined}
        {enable_hover ? render_cancel_edit_shortcut() : undefined}
        {value && !taken && enable_hover
          ? render_confirm_edit_shortcut()
          : undefined}
        {taken && enable_hover ? render_taken_note() : undefined}
      </div>
    );
  }
);

function capitalize_each_word(s: string): string {
  return split(s)
    .map((x: string) => capitalize(x))
    .join(" ");
}

const COMMAND_STYLE = {
  cursor: "pointer",
  borderTop: "1px solid #ccc",
  padding: "5px 0 5px 10px",
} as const;

interface CommandProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  name: string;
  desc: string;
  icon?: IconName;
  shortcuts: KeyboardCommand[];
  taken: string;
}

const Command: React.FC<CommandProps> = React.memo((props: CommandProps) => {
  const { actions, frame_actions, name, desc, icon, shortcuts, taken } = props;

  const [highlight, set_highlight] = useState<boolean>(false);

  function render_icon(): Rendered {
    return <span>{icon ? <Icon name={icon} /> : undefined}</span>;
  }

  function run_command() {
    frame_actions.command(name);
    actions.close_keyboard_shortcuts();
  }

  function on_click() {
    run_command();
  }

  function render_desc(): Rendered {
    return <span>{desc}</span>;
  }

  function render_shortcuts(): Rendered {
    return (
      <Shortcuts
        actions={actions}
        shortcuts={shortcuts}
        name={name}
        taken={taken}
      />
    );
  }

  const style: React.CSSProperties = {
    ...COMMAND_STYLE,
    ...(highlight ? { backgroundColor: "#ddd" } : null),
  };
  return (
    <div
      style={style}
      onClick={on_click}
      onMouseEnter={() => set_highlight(true)}
      onMouseLeave={() => set_highlight(false)}
    >
      <Grid style={{ width: "100%" }}>
        <Row>
          <Col md={1} sm={1}>
            {render_icon()}
          </Col>
          <Col md={7} sm={7}>
            {render_desc()}
          </Col>
          <Col md={4} sm={4}>
            {render_shortcuts()}
          </Col>
        </Row>
      </Grid>
    </div>
  );
});

const COMMAND_LIST_STYLE: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: "3px",
  overflowY: "scroll",
  maxHeight: "50vh",
} as const;

interface CommandListProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  editor_actions: JupyterEditorActions;
  taken: { [name: string]: string };
  search?: string;
}

function should_memoize(prev, next) {
  return prev.search === next.search;
}

const CommandList: React.FC<CommandListProps> = React.memo(
  (props: CommandListProps) => {
    const { actions, frame_actions, editor_actions, taken, search } = props;

    function render_commands(): Rendered[] {
      const v: any[] = [];
      const obj = create_commands(actions, frame_actions, editor_actions);
      for (const name in obj) {
        const val = obj[name];
        if (val != null) {
          v.push({ name, val });
        }
      }
      v.sort(field_cmp("name"));
      const cmds: Rendered[] = [];
      const search_str =
        search != null ? search.toLowerCase() || "" : undefined;
      for (const x of v) {
        if (x.val.f == null) {
          continue;
        }
        const desc = x.val.m != null ? x.val.m : capitalize_each_word(x.name);
        if (desc == null) {
          continue;
        }
        if (desc.toLowerCase().indexOf(search_str) === -1) {
          continue;
        }
        const icon = x.val.i;
        const shortcuts = x.val.k != null ? x.val.k : [];
        cmds.push(
          <Command
            key={x.name}
            name={x.name}
            actions={actions}
            frame_actions={frame_actions}
            desc={desc}
            icon={icon}
            shortcuts={shortcuts}
            taken={taken[x.name]}
          />
        );
      }
      return cmds;
    }

    return <div style={COMMAND_LIST_STYLE}>{render_commands()}</div>;
  },
  should_memoize
);

interface KeyboardShortcutsProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  editor_actions: JupyterEditorActions;
  keyboard_shortcuts?: Map<string, any>;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = React.memo(
  (props: KeyboardShortcutsProps) => {
    const { actions, frame_actions, editor_actions, keyboard_shortcuts } =
      props;

    const [search, set_search] = useState<string>("");
    const commands: {
      [name: string]: CommandDescription;
    } = create_commands(actions, frame_actions, editor_actions);

    const taken: { [name: string]: string } = {};
    for (const name in commands) {
      const val = commands[name];
      if (val != null && val.k != null) {
        for (let s of val.k) {
          if (s.key != null) {
            // TODO: remove this when we switch from using event.which to event.key!
            s = copy_without(s, ["key"]) as any;
          }
          taken[json(s)] = val.m || name;
        }
      }
    }

    function close(): void {
      actions.close_keyboard_shortcuts();
      frame_actions.focus();
    }

    function search_change(s: string): void {
      set_search(s);
    }

    function render_symbols(): Rendered {
      return <ul style={{ marginTop: "30px" }}>{render_symbols_list()}</ul>;
    }

    function render_symbols_list(): Rendered[] {
      return Object.entries(SYMBOLS).map(([key, val]) => (
        <li key={key}>
          <span style={{ width: "20px", display: "inline-block" }}>{val}</span>{" "}
          {key}
        </li>
      ));
    }

    function render_heading(): Rendered {
      return (
        <Grid style={{ width: "100%", fontWeight: "bold", color: "#666" }}>
          <Row>
            <Col md={1} sm={1} />
            <Col md={7} sm={7}>
              Command (click to run)
            </Col>
            <Col md={4} sm={4}>
              Keyboard shortcut
            </Col>
          </Row>
        </Grid>
      );
    }

    if (keyboard_shortcuts == null) return <span />;

    return (
      <Modal show={true} onHide={close} bsSize="large">
        <Modal.Header closeButton>
          <Modal.Title>
            <Icon name="keyboard" /> Jupyter commands and keyboard shortcuts
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Grid style={{ width: "100%" }}>
            <Row>
              <Col md={12}>
                <SearchInput
                  autoFocus={true}
                  value={search}
                  on_change={search_change}
                  placeholder={"Search commands..."}
                />
              </Col>
            </Row>
            <Row>
              <Col md={9}>
                {render_heading()}
                <CommandList
                  actions={actions}
                  frame_actions={frame_actions}
                  editor_actions={editor_actions}
                  taken={taken}
                  search={search}
                />
              </Col>
              <Col md={3}>{render_symbols()}</Col>
            </Row>
          </Grid>
        </Modal.Body>
        <Modal.Footer>
          <span style={{ float: "left", margin: "5px 0 0 25px" }}>
            NOTE: Shortcut customization is{" "}
            <A href="https://github.com/sagemathinc/cocalc/issues/3242">
              not implemented
            </A>
            ; however, it is easy for us to{" "}
            <ShowSupportLink text={"add new shortcuts and commands."} />{" "}
          </span>
          <Button onClick={close}>Close</Button>
        </Modal.Footer>
      </Modal>
    );
  }
);
