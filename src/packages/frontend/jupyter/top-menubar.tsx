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
  MenuDivider,
  MenuItems,
  r_join,
} from "@cocalc/frontend/components";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import {
  all_fields_equal,
  capitalize,
  copy,
  endswith,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "./browser-actions";
import { KeyboardShortcut } from "./keyboard-shortcuts";

type MenuItemName = string | { name: string; display?: string; style?: object };

const TITLE_STYLE: React.CSSProperties = {
  color: COLORS.GRAY_D,
  margin: 0,
  padding: "6px 10px",
  border: 0,
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
    const { actions, /*cur_id, cells, */ name } = props;
    const frameActions = useNotebookFrameActions();

    const has_unsaved_changes: boolean | undefined = useRedux([
      name,
      "has_unsaved_changes",
    ]);
    const backend_kernel_info: immutable.Map<any, any> | undefined = useRedux([
      name,
      "backend_kernel_info",
    ]);
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
            backend_kernel_info.getIn(["language_info", "name"], "") as any,
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

    //     function render_edit(): Rendered {
    //       const cell_type =
    //         cells != null ? cells.getIn([cur_id, "cell_type"]) : undefined;
    //       return render_menu({
    //         heading: "Edit",
    //         disabled: read_only,
    //         names: [
    //           "global undo",
    //           "global redo",
    //           "",
    //           "cut cell",
    //           "copy cell",
    //           "paste cell above",
    //           "paste cell below",
    //           "paste cell and replace",
    //           "delete cell",
    //           "delete all blank code cells",
    //           "",
    //           "split cell at cursor",
    //           "merge cell with previous cell",
    //           "merge cell with next cell",
    //           "merge cells",
    //           "",
    //           "move cell up",
    //           "move cell down",
    //           "",
    //           "write protect",
    //           "delete protect",
    //           "",
    //           "toggle hide input",
    //           "toggle hide output",
    //           "",
    //           "find and replace",
    //           "",
    //           `${cell_type !== "markdown" ? "<" : ""}insert image`,
    //         ],
    //       }); // disable if not markdown
    //     }

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


    function render_menu_item(
      key: string,
      name1: MenuItemName | MenuItems[0],
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
        style.color = COLORS.GRAY;
      } else {
        disabled = false;
      }

      if (name[0] === ">") {
        style.marginLeft = "4ex";
        name = name.slice(1);
      }
      if (name[0] === "~") {
        style.marginLeft = "2ex";
        style.color = COLORS.GRAY;
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
            style={{ marginLeft: "1em", color: COLORS.GRAY }}
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
          mode={"vertical"}
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
      </ButtonGroup>
    );
  },
  should_memoize,
);

