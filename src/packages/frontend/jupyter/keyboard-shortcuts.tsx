/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// The keyboard shortcuts and command listing dialog, which:
//
//   - lets you search through all available commands
//   - see and change the keyboard shortcuts for those commands\

import { Button, Modal } from "antd";
import { Map } from "immutable";
import json from "json-stable-stringify";
import { useIntl } from "react-intl";

import { Col, Grid, Row } from "@cocalc/frontend/antd-bootstrap";
import { CSS, React, Rendered, useState } from "@cocalc/frontend/app-framework";
import {
  A,
  Icon,
  IconName,
  SearchInput,
  r_join,
} from "@cocalc/frontend/components";
import { IconRotation } from "@cocalc/frontend/components/icon";
import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { isIntlMessage, labels } from "@cocalc/frontend/i18n";
import { ShowSupportLink } from "@cocalc/frontend/support";
import { capitalize, copy_without, field_cmp, split } from "@cocalc/util/misc";
import { JupyterActions } from "./browser-actions";
import {
  CommandDescription,
  KeyboardCommand,
  commands as create_commands,
} from "./commands";
import { evt_to_obj, keyCode_to_chr } from "./keyboard";

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
  delete: "DEL",
};

export function shortcut_to_string(shortcut: KeyboardCommand): string {
  const v: string[] = [];
  if (shortcut.shift) {
    v.push(SYMBOLS.shift);
  }
  if (shortcut.ctrl) {
    v.push(SYMBOLS.ctrl);
  }
  if (shortcut.alt) {
    v.push(SYMBOLS.alt);
  }
  if (shortcut.meta) {
    v.push(SYMBOLS.meta);
  }
  if (shortcut.key) {
    v.push(shortcut.key);
  } else {
    // TODO: using which is buggy/horrible/confusing/deprecated!
    // we should get rid of this...
    const keyCode = shortcut.which;
    if (keyCode != null) {
      switch (keyCode) {
        case 8:
          v.push(SYMBOLS.backspace);
          break;
        case 13:
          v.push(SYMBOLS.return);
          break;
        case 32:
          v.push(SYMBOLS.space);
          break;
        case 27:
          v.push("Esc");
          break;
        case 40:
          v.push(SYMBOLS.down);
          break;
        case 38:
          v.push(SYMBOLS.up);
          break;
        case 46:
          v.push(SYMBOLS.delete);
          break;
        default:
          v.push(keyCode_to_chr(keyCode));
      }
    }
  }
  let s = v.join(" ");
  if (shortcut.twice) {
    s = s + "," + s;
  }
  return s;
}

interface KeyboardShortcutProps {
  shortcut: KeyboardCommand;
}

export const KeyboardShortcut: React.FC<KeyboardShortcutProps> = (
  props: KeyboardShortcutProps,
) => {
  const { shortcut } = props;

  return <span>{shortcut_to_string(shortcut)}</span>;
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

    function render_shortcuts() {
      const result: Rendered[] = [];
      for (const key in shortcuts) {
        const shortcut = shortcuts[key];
        result.push(render_shortcut(key, shortcut));
      }
      return r_join(result, " ");
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
        <Button size="small" key={key}>
          <KeyboardShortcut shortcut={shortcut} />
        </Button>
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
      let taken = prop_taken[json(evt_to_obj(e, "edit"))!];
      if (taken == null) {
        taken = prop_taken[json(shortcut)!];
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
  },
);

function capitalize_each_word(s: string): string {
  return split(s)
    .map((x: string) => capitalize(x))
    .join(" ");
}

const COMMAND_STYLE: CSS = {
  cursor: "pointer",
  borderTop: "1px solid #ccc",
  padding: "5px 0 5px 10px",
} as const;

interface CommandProps {
  actions: JupyterActions;
  name: string;
  desc: string;
  icon?: IconName;
  iconRotate?: IconRotation;
  shortcuts: KeyboardCommand[];
  taken: string;
}

const Command: React.FC<CommandProps> = React.memo((props: CommandProps) => {
  const { actions, name, desc, icon, iconRotate, shortcuts, taken } = props;
  const frameActions = useNotebookFrameActions();
  const [highlight, set_highlight] = useState<boolean>(false);

  function render_icon(): Rendered {
    return (
      <span>{icon ? <Icon name={icon} rotate={iconRotate} /> : undefined}</span>
    );
  }

  function run_command() {
    frameActions.current?.command(name);
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
  editor_actions: JupyterEditorActions;
  taken: { [name: string]: string };
  search?: string;
}

function should_memoize(prev, next) {
  return prev.search === next.search;
}

const CommandList: React.FC<CommandListProps> = React.memo(
  (props: CommandListProps) => {
    const { actions, editor_actions, taken, search } = props;
    const intl = useIntl();
    const frameActions = useNotebookFrameActions();

    function render_commands(): Rendered[] {
      const v: { name: string; val: CommandDescription }[] = [];
      const allActions = {
        jupyter_actions: actions,
        frame_actions: frameActions.current,
        editor_actions,
      };
      const obj = create_commands(allActions);
      for (const name in obj) {
        const val = obj[name];
        if (val != null) {
          v.push({ name, val });
        }
      }
      v.sort(field_cmp("name"));
      const cmds: Rendered[] = [];
      const search_str = search?.toLowerCase() ?? "";
      for (const x of v) {
        if (x.val.f == null) {
          continue;
        }
        const m = x.val.m;
        const desc: string =
          m == null
            ? capitalize_each_word(x.name)
            : isIntlMessage(m)
            ? intl.formatMessage(m)
            : m;
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
            desc={desc}
            icon={icon}
            iconRotate={x.val.ir}
            shortcuts={shortcuts}
            taken={taken[x.name]}
          />,
        );
      }
      return cmds;
    }

    return <div style={COMMAND_LIST_STYLE}>{render_commands()}</div>;
  },
  should_memoize,
);

interface KeyboardShortcutsProps {
  actions: JupyterActions;
  editor_actions: JupyterEditorActions;
  keyboard_shortcuts?: Map<string, any>;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = React.memo(
  (props: KeyboardShortcutsProps) => {
    const { actions, editor_actions, keyboard_shortcuts } = props;
    const intl = useIntl();
    const frameActions = useNotebookFrameActions();
    const [search, set_search] = useState<string>("");
    const allActions = {
      jupyter_actions: actions,
      frame_actions: frameActions.current,
      editor_actions,
    };
    const commands: { [name: string]: CommandDescription } =
      create_commands(allActions);

    const taken: { [name: string]: string } = {};
    for (const name in commands) {
      const val = commands[name];
      if (val != null && val.k != null) {
        for (let s of val.k) {
          if (s.key != null) {
            // TODO: remove this when we switch from using event.which to event.key!
            s = copy_without(s, ["key"]) as any;
          }
          const { m } = val;
          const title = !m
            ? name
            : isIntlMessage(m)
            ? intl.formatMessage(m)
            : m;
          taken[json(s)!] = title;
        }
      }
    }

    function close(): void {
      actions.close_keyboard_shortcuts();
      frameActions.current?.focus();
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
          <span style={{ width: "30px", display: "inline-block" }}>{val}</span>{" "}
          {key}
        </li>
      ));
    }

    function render_heading(): Rendered {
      return (
        <Grid
          style={{
            width: "100%",
            fontWeight: "bold",
            color: "#666",
            marginTop: "15px",
          }}
        >
          <Row>
            <Col md={1} sm={1} />
            <Col md={7} sm={7}>
              Command (click to run)
            </Col>
            <Col md={4} sm={4}>
              {intl.formatMessage(labels.keyboard_shortcuts)}
            </Col>
          </Row>
        </Grid>
      );
    }

    if (keyboard_shortcuts == null) return <span />;

    return (
      <Modal
        open
        onCancel={close}
        onOk={close}
        width={900}
        title={
          <>
            <Icon name="keyboard" /> Jupyter Commands and Keyboard Shortcuts
          </>
        }
        footer={
          <>
            <span style={{ float: "left", margin: "5px 0 0 25px" }}>
              NOTE: Shortcut customization is{" "}
              <A href="https://github.com/sagemathinc/cocalc/issues/3242">
                not implemented
              </A>
              ; however, it is easy for us to{" "}
              <ShowSupportLink text={"add new shortcuts and commands."} />{" "}
            </span>
            <Button onClick={close}>Close</Button>
          </>
        }
      >
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
                editor_actions={editor_actions}
                taken={taken}
                search={search}
              />
            </Col>
            <Col md={3}>{render_symbols()}</Col>
          </Row>
        </Grid>
      </Modal>
    );
  },
);
