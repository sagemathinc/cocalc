/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The Menu bar across the top
//
// File, Edit, etc....

import { React, useTypedRedux, useRedux, Rendered } from "../app-framework";
import { user_activity } from "../tracker";
import * as immutable from "immutable";
import { ButtonGroup, SelectCallback } from "react-bootstrap";
import { Icon, r_join, DropdownMenu, MenuItem, MenuDivider } from "../r_misc";
import { KeyboardShortcut } from "./keyboard-shortcuts";
import { open_new_tab } from "../misc-page";
import { capitalize, copy, endswith, all_fields_equal } from "smc-util/misc";
import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";
import { get_help_links } from "./help-links";

type MenuItemName =
  | string
  | { name: string; display?: string; style?: object }
  | Rendered;

const TITLE_STYLE: React.CSSProperties = {
  color: "#666",
  border: 0,
  backgroundColor: "rgb(247,247,247)",
} as const;
const SELECTED_STYLE: React.CSSProperties = {
  color: "#2196F3",
  fontWeight: "bold",
} as const;

interface TopMenubarProps {
  // OWN PROPS
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  cur_id: string;
  cells: immutable.Map<any, any>; // map from id to cells
  name: string;
}

function should_memoize(prev, next) {
  return all_fields_equal(prev, next, [
    "has_unsaved_changes",
    "read_only",
    "kernels",
    "kernel_state",
    "backend_kernel_info",
    "cur_id",
    "cells",
    "toolbar",
    "cell_toolbar",
  ]);
}

export const TopMenubar: React.FC<TopMenubarProps> = React.memo(
  (props: TopMenubarProps) => {
    const { actions, frame_actions, cur_id, cells, name } = props;

    const kernels: immutable.List<any> | undefined = useRedux([
      name,
      "kernels",
    ]);
    const kernel_state: string | undefined = useRedux([name, "kernel_state"]);
    const has_unsaved_changes: boolean | undefined = useRedux([
      name,
      "has_unsaved_changes",
    ]);
    const kernel_info: immutable.Map<any, any> | undefined = useRedux([
      name,
      "kernel_info",
    ]);
    const backend_kernel_info: immutable.Map<any, any> | undefined = useRedux([
      name,
      "backend_kernel_info",
    ]);
    const toolbar_state: boolean | undefined = useRedux([name, "toolbar"]);
    const cell_toolbar: string | undefined = useRedux([name, "cell_toolbar"]);
    const read_only: boolean | undefined = useRedux([name, "read_only"]);

    const fullscreen: string | undefined = useTypedRedux("page", "fullscreen");

    function render_file(): Rendered {
      if (actions.studentProjectFunctionality().disableActions) {
        // Everything in this menu is either easily still available in
        // project tabs or generaly something that downloads, so we
        // just remove it.
        // NOTE/TODO: When we rewrite this TopMenubar0 as a functional
        // component, be sure to switch to use the
        // useStudentProjectFunctionality hook so that this File menu
        // immediately appears/disappears whenever the course field
        // changes, rather than only when the notebook loads.
        return;
      }
      let script_entry: any = undefined;
      if (backend_kernel_info != null) {
        const ext = backend_kernel_info.getIn([
          "language_info",
          "file_extension",
        ]);
        if (ext != null) {
          const m = capitalize(
            backend_kernel_info.getIn(["language_info", "name"], "")
          );
          script_entry = {
            name: ">nbconvert script",
            display: `${m} (${ext})...`,
          };
        }
      }
      if (script_entry === undefined) {
        script_entry = ">nbconvert script";
      }

      let trust;
      if (trust) {
        trust = { name: "<trust notebook", display: "Trusted notebook" };
      } else {
        trust = { name: "trust notebook", display: "Trust notebook..." };
      }

      let save = "save notebook";
      if (!has_unsaved_changes || read_only) {
        save = `<${save}`;
      }

      let rename = "rename notebook";
      if (has_unsaved_changes || read_only) {
        rename = `<${rename}`;
      }

      let close_and_halt = "close and halt";
      if (read_only) {
        close_and_halt = `<${close_and_halt}`;
      }

      const names = [
        "new notebook",
        "open file",
        close_and_halt,
        "",
        "duplicate notebook",
        rename,
        save,
        "table of contents",
        "time travel",
        "",
        "print preview",
        "slideshow",
        "nbconvert slides",
        "<Download as...",
        ">nbconvert ipynb",
        script_entry,
        ">nbconvert html",
        ">nbconvert markdown",
        ">nbconvert rst",
        ">nbconvert tex",
        ">nbconvert chromium pdf",
        ">nbconvert latex pdf",
        ">nbconvert sagews",
        ">nbconvert asciidoc",
        "",
        trust,
      ];
      if (fullscreen !== "kiosk") {
        names.push("");
        names.push("switch to classical notebook");
      }

      return render_menu({
        heading: "File",
        names,
      });
    }

    function render_edit(): Rendered {
      const cell_type =
        cells != null ? cells.getIn([cur_id, "cell_type"]) : undefined;
      return render_menu({
        heading: "Edit",
        disabled: read_only,
        names: [
          "global undo",
          "global redo",
          "",
          "cut cell",
          "copy cell",
          "paste cell above",
          "paste cell below",
          "paste cell and replace",
          "delete cell",
          "",
          "split cell at cursor",
          "merge cell with previous cell",
          "merge cell with next cell",
          "merge cells",
          "",
          "move cell up",
          "move cell down",
          "",
          "write protect",
          "delete protect",
          "",
          "toggle hide input",
          "toggle hide output",
          "",
          "find and replace",
          "",
          `${cell_type !== "markdown" ? "<" : ""}insert image`,
        ],
      }); // disable if not markdown
    }

    function render_view(): Rendered {
      const toolbar = {
        name: "toggle toolbar",
        display: toolbar_state ? "Hide Toolbar" : "Show Toolbar",
      };

      const cell_toolbars: any = [];
      for (const name of [
        "none",
        "metadata",
        "slideshow",
        "attachments",
        "tags",
        "create_assignment",
      ]) {
        const item_name = `>cell toolbar ${name}`;
        if ((cell_toolbar != null ? cell_toolbar : "none") === name) {
          cell_toolbars.push({ name: item_name, style: SELECTED_STYLE });
        } else {
          cell_toolbars.push(item_name);
        }
      }

      return render_menu({
        heading: "View",
        disabled: read_only,
        names: [
          "toggle header",
          toolbar,
          "toggle all line numbers",
          "",
          "<Cell Toolbar...",
        ]
          .concat(cell_toolbars)
          .concat(["", "zoom in", "zoom out"]),
      });
    }

    function render_insert(): Rendered {
      return render_menu({
        heading: "Insert",
        names: ["insert cell above", "insert cell below"],
        disabled: read_only,
      });
    }

    function render_cell(): Rendered {
      return render_menu({
        heading: "Cell",
        disabled: read_only,
        names: [
          "run cell",
          "run cell and select next",
          "run cell and insert below",
          "run all cells",
          "run all cells above",
          "run all cells below",
          "",
          "<Cell type...",
          ">change cell to code",
          ">change cell to markdown",
          ">change cell to raw",
          "",
          "<Selected output...",
          ">toggle cell output collapsed",
          ">toggle cell output scrolled",
          ">clear cell output",
          "",
          "<All output...",
          ">toggle all cells output collapsed",
          ">toggle all cells output scrolled",
          ">clear all cells output",
          "",
          "<Format code...",
          ">format cells",
          ">format all cells",
        ],
      });
    }

    // TODO: upper case kernel names, descriptions... and make it a new component for
    // efficiency so don't re-render if not change

    function handle_kernel_select(kernel_name: string): void {
      actions.set_kernel(kernel_name);
      focus();
      actions.set_default_kernel(kernel_name);
      user_activity("cocal_jupyter", "change kernel", kernel_name);
    }

    function render_kernel_item(kernel: any): Rendered {
      const style: React.CSSProperties = { marginLeft: "4ex" };
      if (kernel.name === kernel) {
        style.color = "#2196F3";
        style.fontWeight = "bold";
      }
      return (
        <MenuItem
          key={kernel.name}
          onClick={() => {
            handle_kernel_select(kernel.name);
          }}
        >
          <span style={style}> {kernel.display_name} </span>
        </MenuItem>
      );
    }

    function render_kernel_items(): Rendered[] | undefined {
      if (kernels == null) {
        return;
      }
      const kernels_js = kernels.toJS();
      return kernels_js.map((kernel) => render_kernel_item(kernel));
    }

    function render_kernel(): Rendered {
      const items = render_kernel_items();
      const names: any[] = [
        `${kernel_state !== "busy" ? "<" : ""}interrupt kernel`,
        "confirm restart kernel",
        "confirm halt kernel",
        "<Restart and...",
        ">confirm restart kernel and clear output",
        ">confirm restart kernel and run all cells",
        ">confirm restart kernel and run all cells without halting on error",
        "",
        "<Change kernel...",
      ]
        .concat((items as any) || [])
        .concat(["", "refresh kernels"])
        .concat(["", "custom kernel"]);

      return render_menu({
        heading: "Kernel",
        names,
        disabled: read_only,
      });
    }

    function focus(): void {
      $(":focus").blur(); // battling with react-bootstrap stupidity... ?
      frame_actions.focus(true);
    }

    function handle_command(name: string): void {
      frame_actions.command(name);
      $(":focus").blur(); // battling with react-bootstrap stupidity... ?
      const c = frame_actions.commands[name];
      if (c && c.m && endswith(c.m, "...")) {
        frame_actions.blur();
      } else {
        focus();
      }
    }

    function command(name: string): SelectCallback {
      return () => {
        frame_actions.command(name);
        $(":focus").blur(); // battling with react-bootstrap stupidity... ?
        const c = frame_actions.commands[name];
        if (c && c.m && endswith(c.m, "...")) {
          frame_actions.blur();
        } else {
          focus();
        }
      };
    }

    function render_menu_item(
      key: string,
      name: MenuItemName
    ): { item: Rendered; command_name: string } {
      if (name === "") {
        return { item: <MenuDivider key={key} />, command_name: "" };
      }

      if (name != null && (name as any).props != null) {
        return { item: name as Rendered, command_name: "" }; // it's already a MenuItem components
      }

      let display: undefined | string;
      let style: React.CSSProperties | undefined = undefined;

      if (typeof name === "object") {
        // use {name:'>nbconvert script', display:"Executable Script (.zzz)..."}, say, to be explicit about custom name to show
        ({ name, display, style } = name as any);
        if (style != null) {
          style = copy(style);
        }
      } else {
        display = undefined;
      }

      if (style == null) {
        style = {};
      }

      if (typeof name != "string") {
        // HEISENBUG: This was reported once in production and led to a complete browser crash, preventing
        // the user to use Jupyter.  No clue how this is possible, and it's probably the result
        // of some other mystery problem.  But it probably can't hurt to make this non-fatal,
        // just in case it happens in some edge case that we're just not thinking of.
        console.warn(
          "bug -- name must be a string at this point; working around this.  name=",
          name
        );
        name = `${name}`;
      }

      let disabled: boolean;
      if (name[0] === "<") {
        disabled = true;
        name = name.slice(1);
      } else {
        disabled = false;
      }

      if (name[0] === ">") {
        style.marginLeft = "4ex";
        name = name.slice(1);
      }
      const obj = frame_actions.commands[name];
      if (obj == null) {
        const item = (
          <MenuItem disabled={disabled} key={key}>
            <span style={style}>{display != null ? display : name}</span>
          </MenuItem>
        );
        return { item, command_name: "" };
      }

      let s: Rendered;
      if (obj.k != null) {
        const v: Rendered[] = [];
        let i = 0;
        for (const shortcut of obj.k) {
          v.push(<KeyboardShortcut key={i} shortcut={shortcut} />);
          i += 1;
        }
        s = (
          <span className="pull-right" style={{ marginLeft: "1em" }}>
            {r_join(v, ", ")}
          </span>
        );
      } else {
        s = <span />;
      }

      if (!display) display = obj.menu;
      if (!display) display = obj.m;
      if (!display) display = name;

      const item = (
        <MenuItem key={key} disabled={disabled}>
          <span style={style}>
            {s} {display}{" "}
            {/* shortcut must be first! -- https://github.com/sagemathinc/cocalc/issues/1935 */}
          </span>
        </MenuItem>
      );
      return { item, command_name: name };
    }

    function render_menu_items(names: MenuItemName[]): {
      items: Rendered[];
      command_names: { [key: string]: string };
    } {
      const items: Rendered[] = [];
      const command_names: { [key: string]: string } = {};
      for (const key in names) {
        const { item, command_name } = render_menu_item(key, names[key]);
        items.push(item);
        command_names[key] = command_name;
      }
      return { items, command_names };
    }

    function render_menu(opts: {
      heading: string;
      names: MenuItemName[];
      disabled?: boolean;
    }): Rendered {
      let { heading, names, disabled } = opts;
      if (disabled == null) disabled = false;
      const { items, command_names } = render_menu_items(names);
      return (
        <DropdownMenu
          title={heading}
          key={heading}
          id={heading}
          disabled={opts.disabled}
          onClick={(key) => {
            const name = command_names[key];
            if (name == null) return;
            handle_command(name);
          }}
        >
          {items}
        </DropdownMenu>
      );
    }

    function render_links(): Rendered[] {
      if (kernel_info == null) return [];
      const v: Rendered[] = [];
      const lang = kernel_info.get("language");
      const links = get_help_links(lang);
      if (links == null) return v;
      for (const name in links) {
        const url = links[name];
        v.push(external_link(name, url));
      }
      return v;
    }

    function render_help(): Rendered {
      return (
        <DropdownMenu
          key="help"
          id="menu-help"
          title={"Help"}
          style={TITLE_STYLE}
        >
          <MenuItem key="help-about" onClick={() => actions.show_about()}>
            <Icon name="question-circle" /> About...
          </MenuItem>
          <MenuDivider />
          <MenuItem
            key="help-keyboard"
            onClick={command("edit keyboard shortcuts")}
          >
            <Icon name="keyboard" /> Keyboard shortcuts...
          </MenuItem>
          <MenuDivider />
          {external_link(
            "Notebook help",
            "http://nbviewer.jupyter.org/github/ipython/ipython/blob/3.x/examples/Notebook/Index.ipynb"
          )}
          {external_link(
            "Jupyter in CoCalc",
            "https://doc.cocalc.com/jupyter.html"
          )}
          {external_link(
            "nbgrader in CoCalc",
            "https://doc.cocalc.com/teaching-nbgrader.html"
          )}
          {external_link(
            "Custom Jupyter kernels",
            "https://doc.cocalc.com/howto/custom-jupyter-kernel.html"
          )}
          {external_link(
            "Markdown",
            "https://help.github.com/articles/basic-writing-and-formatting-syntax"
          )}
          <MenuDivider />
          {render_links()}
        </DropdownMenu>
      );
    }

    return (
      <div
        style={{
          backgroundColor: "rgb(247,247,247)",
          border: "1px solid #e7e7e7",
          minHeight: "34px",
          paddingTop: "4px",
        }}
      >
        <ButtonGroup>
          {render_file()}
          {render_edit()}
          {render_view()}
          {render_insert()}
          {render_cell()}
          {render_kernel()}
          {render_help()}
        </ButtonGroup>
      </div>
    );
  },
  should_memoize
);

function external_link(name: string, url: string): Rendered {
  return (
    <MenuItem key={name} onClick={() => open_new_tab(url)}>
      <Icon name="external-link" /> {name}
    </MenuItem>
  );
}
