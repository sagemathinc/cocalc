/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The Menu bar across the top
// File, Edit, etc....

import * as immutable from "immutable";

import { ButtonGroup } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  Rendered,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  DropdownMenu,
  Icon,
  MenuDivider,
  MenuItems,
  r_join,
} from "@cocalc/frontend/components";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { open_new_tab } from "@cocalc/frontend/misc";
import { cmp } from "@cocalc/util/misc";
import { user_activity } from "@cocalc/frontend/tracker";
import {
  all_fields_equal,
  capitalize,
  copy,
  endswith,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "./browser-actions";
import { get_help_links } from "./help-links";
import { KeyboardShortcut } from "./keyboard-shortcuts";
import Logo from "./logo";

type MenuItemName = string | { name: string; display?: string; style?: object };

const TITLE_STYLE: React.CSSProperties = {
  color: COLORS.GRAY_D,
  margin: 0,
  padding: "6px 10px",
  border: 0,
} as const;

const SELECTED_STYLE: React.CSSProperties = {
  color: "#2196F3",
  fontWeight: "bold",
} as const;

interface TopMenubarProps {
  // OWN PROPS
  actions: JupyterActions;
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
    const { actions, cur_id, cells, name } = props;
    const frameActions = useNotebookFrameActions();

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
    const trust: boolean | undefined = useRedux([name, "trust"]);

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

      const trust_entry = trust
        ? { name: "<trust notebook", display: "Trusted notebook" }
        : { name: "trust notebook", display: "Trust notebook..." };

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
        "slideshow",
        "nbconvert slides",
        "<Save and Download as...",
        ">nbconvert ipynb",
        ">nbconvert cocalc html",
        ">nbconvert cocalc pdf",
        ">nbconvert latex pdf",
        script_entry,
        ">nbconvert markdown",
        ">nbconvert rst",
        ">nbconvert tex",
        ">nbconvert sagews",
        ">nbconvert asciidoc",
        ">nbconvert classic html",
        ">nbconvert classic pdf",
        ">nbconvert lab html",
        ">nbconvert lab pdf",
        "",
        trust_entry,
      ];
      if (fullscreen !== "kiosk") {
        names.push("", "switch to classical notebook");
      }

      // bottom of "File" is the usual spot to exit a desktop application
      names.push("", close_and_halt);

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
          "delete all blank code cells",
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

    function render_kernel_item(kernel: any): MenuItems[0] | string {
      if (kernel == null) return "";
      const style: React.CSSProperties = { marginLeft: "4ex" };
      if (kernel.name === kernel) {
        style.color = "#2196F3";
        style.fontWeight = "bold";
      }
      let label = (
        <span style={style}>
          <Logo kernel={kernel.name} size={20} style={{ marginTop: "-2px" }} />{" "}
          {kernel.display_name}{" "}
        </span>
      );
      if (kernel_info?.get("name") == kernel.name) {
        label = <b>{label}</b>;
      }
      return {
        key: kernel.name,
        label,
        onClick: () => {
          handle_kernel_select(kernel.name);
        },
      };
    }

    function render_kernel_items(): (MenuItems[0] | string)[] | undefined {
      if (kernels == null) {
        return;
      }
      const kernels_js = kernels.toJS();
      kernels_js.sort((a, b) => {
        const c = -cmp(
          a.metadata?.cocalc?.priority ?? 0,
          b.metadata?.cocalc?.priority ?? 0
        );
        if (c != 0) return c;
        return cmp(a.display_name, b.display_name);
      });
      let i = 0;
      while (
        i < kernels_js.length &&
        (kernels_js[i].metadata?.cocalc?.priority ?? 0) >= 10
      ) {
        i += 1;
      }
      if (i < kernels_js.length) {
        kernels_js.splice(i, 0, null);
      }

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
      ]
        .concat([
          items?.length ?? 0 > 0
            ? "<Change kernel..."
            : "<No Kernels available!",
        ])
        .concat((items as any) || [])
        .concat(["", "no kernel"])
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
      frameActions.current?.focus(true);
    }

    function handle_command(name?: string): void {
      if (name == null) return;
      frameActions.current?.command(name);
      $(":focus").blur(); // battling with react-bootstrap stupidity... ?
      const c = frameActions.current?.commands[name];
      if (c && c.m && endswith(c.m, "...")) {
        frameActions.current?.blur();
      } else {
        focus();
      }
    }

    function command(name: string) {
      return () => {
        frameActions.current?.command(name);
        $(":focus").blur(); // battling with react-bootstrap stupidity... ?
        const c = frameActions.current?.commands[name];
        if (c && c.m && endswith(c.m, "...")) {
          frameActions.current?.blur();
        } else {
          focus();
        }
      };
    }

    function render_menu_item(
      key: string,
      name1: MenuItemName | MenuItems[0]
    ): MenuItems[0] {
      if (!name1) return MenuDivider;
      if (name1["label"] != null) {
        // it is of type MenuItem[0]
        return name1 as MenuItems[0];
      }

      let name = typeof name1 === "string" ? name1 : undefined;
      let display: undefined | string;
      let style: React.CSSProperties | undefined = undefined;

      if (typeof name1 === "object") {
        // use {name:'>nbconvert script', display:"Executable Script (.zzz)..."}, say, to be explicit about custom name to show
        ({ name, display, style } = name1 as any);
        if (style != null) {
          style = copy(style);
        }
      } else {
        display = undefined;
      }
      if (!name) return MenuDivider;

      style ??= {};

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
      const obj = frameActions.current?.commands[name];
      if (obj == null) {
        const item: MenuItems[0] = {
          key: key,
          disabled: true,
          label: <span style={style}>{display != null ? display : name}</span>,
        };
        return item;
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
          <span
            className="pull-right"
            style={{ marginLeft: "1em", color: "#888" }}
          >
            {r_join(v, ", ")}
          </span>
        );
      } else {
        s = <span />;
      }

      display ??= obj.menu ?? obj.m ?? name;

      const item: MenuItems[0] = {
        key,
        disabled,
        label: (
          <span style={style}>
            {s} {display}{" "}
            {/* shortcut must be first! --  https://github.com/sagemathinc/cocalc/issues/1935 */}
          </span>
        ),
        onClick: () => handle_command(name),
      };

      return item;
    }

    function render_menu_items(names: MenuItemName[]): MenuItems {
      const items: MenuItems = [];
      for (const key in names) {
        const item = render_menu_item(key, names[key]);
        items.push(item);
      }
      return items;
    }

    function render_menu(opts: {
      heading: string;
      names: MenuItemName[];
      disabled?: boolean;
    }): Rendered {
      let { heading, names, disabled } = opts;
      if (disabled == null) disabled = false;
      const items = render_menu_items(names);
      return (
        <DropdownMenu
          title={heading}
          key={heading}
          id={heading}
          disabled={opts.disabled}
          style={TITLE_STYLE}
          items={items}
        />
      );
    }

    function render_links(): MenuItems {
      if (kernel_info == null) return [];
      const lang = kernel_info.get("language");
      const links = get_help_links(lang);
      const v: MenuItems = [];
      if (links == null) return v;
      for (const name in links) {
        const url = links[name];
        v.push(external_link(name, url));
      }
      if (v.length > 0) {
        v.unshift(MenuDivider);
      }
      return v;
    }

    function render_help(): Rendered {
      const items: MenuItems = [
        {
          key: "help-about",
          label: (
            <>
              <Icon name="question-circle" /> About...
            </>
          ),
          onClick: () => actions.show_about(),
        },
        MenuDivider,
        {
          key: "help-keyboard",
          label: (
            <>
              <Icon name="keyboard" /> Keyboard shortcuts...
            </>
          ),
          onClick: command("edit keyboard shortcuts"),
        },
        MenuDivider,
        external_link(
          "Notebook help",
          "http://nbviewer.jupyter.org/github/ipython/ipython/blob/3.x/examples/Notebook/Index.ipynb"
        ),
        external_link(
          "Jupyter in CoCalc",
          "https://doc.cocalc.com/jupyter.html"
        ),
        external_link(
          "nbgrader in CoCalc",
          "https://doc.cocalc.com/teaching-nbgrader.html"
        ),
        external_link(
          "Custom Jupyter kernels",
          "https://doc.cocalc.com/howto/custom-jupyter-kernel.html"
        ),
        external_link(
          "Markdown",
          "https://help.github.com/articles/basic-writing-and-formatting-syntax"
        ),
        ...render_links(),
      ];

      return (
        <DropdownMenu
          key="help"
          id="menu-help"
          title={"Help"}
          style={TITLE_STYLE}
          items={items}
        />
      );
    }

    return (
      <ButtonGroup
        className="cocalc-jupyter-menu"
        style={{
          display: "block",
          backgroundColor: COLORS.GRAY_LLL,
          padding: "8px 0px",
        }}
      >
        {render_file()}
        {render_edit()}
        {render_view()}
        {render_insert()}
        {render_cell()}
        {render_kernel()}
        {render_help()}
      </ButtonGroup>
    );
  },
  should_memoize
);

function external_link(name: string, url: string): MenuItems[0] {
  return {
    key: name,
    label: (
      <>
        <Icon name="external-link" /> {name}
      </>
    ),
    onClick: () => open_new_tab(url),
  };
}
