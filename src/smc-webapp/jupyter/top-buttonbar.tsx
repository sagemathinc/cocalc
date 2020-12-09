/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The static buttonbar at the top.

import { CSS, React, useRedux } from "../app-framework";
import * as immutable from "immutable";
import { Button, ButtonGroup, Form } from "react-bootstrap";
import {
  Icon,
  VisibleMDLG,
  VisibleLG,
  DropdownMenu,
  MenuItem,
} from "../r_misc";
import { endswith, capitalize } from "smc-util/misc";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";
import { Cells, CellType, Usage } from "./types";
import { ALERT_COLS } from "./usage";

type ButtonDescription =
  | string
  | {
      name: string;
      disabled?: boolean;
      style?: CSS;
      label?: string | JSX.Element;
      className?: string;
    };

interface Props {
  frame_actions: NotebookFrameActions;
  cur_id: string; // id of currently selected cell
  sel_ids: immutable.Set<string>; // set of selected cells
  cells: Cells; // map from id to cells
  cell_toolbar?: string;
  name: string;
  usage: Usage;
}

export const TopButtonbar: React.FC<Props> = React.memo((props: Props) => {
  const {
    frame_actions,
    cur_id,
    sel_ids,
    cells,
    cell_toolbar,
    name,
    usage,
  } = props;
  const read_only = useRedux([name, "read_only"]);

  function focus() {
    frame_actions.focus(true);
  }

  function command(name: string, do_focus: boolean): (event?) => void {
    return (_event?): void => {
      $(":focus").blur(); // battling with react-bootstrap stupidity... ?
      frame_actions.command(name);
      if (do_focus) {
        focus();
      } else {
        frame_actions.blur();
      }
    };
  }

  function render_button(key: string, name: ButtonDescription) {
    let className: string | undefined = undefined;
    let disabled: boolean | undefined = false;
    let label: string | JSX.Element | undefined = "";
    let style: CSS | undefined = undefined;
    if (typeof name === "object") {
      ({ name, disabled, style, label, className } = name);
    }
    if (style == null) {
      style = undefined;
    }
    if (disabled == null) {
      disabled = false;
    }
    if (label == null) {
      label = "";
    }
    if (className == null) {
      className = undefined;
    }
    if (read_only) {
      // all buttons disabled in read-only mode
      disabled = true;
    }
    const obj = frame_actions.commands[name];
    if (obj == null) {
      throw Error(`command ${name} is not defined`);
    }
    const focus: boolean = !endswith(obj.m ? obj.m : "", "...");
    return (
      <Button
        className={className}
        key={key}
        onClick={command(name, focus)}
        title={obj.m}
        disabled={disabled}
        style={style}
      >
        {obj.i && <Icon name={obj.i} />} {label}
      </Button>
    );
  }

  function render_buttons(names: ButtonDescription[]) {
    const result: JSX.Element[] = [];
    for (const key in names) {
      result.push(render_button(key, names[key]));
    }
    return result;
  }

  function render_button_group(names: ButtonDescription[], hide_xs?: boolean) {
    return (
      <ButtonGroup className={hide_xs ? "hidden-xs" : ""}>
        {render_buttons(names)}
      </ButtonGroup>
    );
  }

  function render_add_cell() {
    return render_buttons(["insert cell below"]);
  }

  function render_group_move() {
    return (
      <VisibleLG>
        {render_button_group(["move cell up", "move cell down"], true)}
      </VisibleLG>
    );
  }

  function render_group_run() {
    // indicate the stop button after a brief timeout, e.g. 1 second
    const stop_style =
      usage.cpu_runtime > 1
        ? { backgroundColor: ALERT_COLS[usage.time_alert], color: "white" }
        : undefined;

    return render_button_group([
      { name: "run cell and select next" },
      { name: "interrupt kernel", style: stop_style, className: "cocalc-jupyter-btn-interrupt" },
      "confirm restart kernel",
      "confirm restart kernel and run all cells",
      { name: "tab key", label: "tab" },
    ]);
  }

  function cell_select_type(type: CellType): void {
    frame_actions.set_selected_cell_type(type);
    focus();
  }

  function cell_type_title(key: string): string {
    switch (key) {
      case "multi":
        return "-";
      default:
        return capitalize(key);
    }
  }

  function render_select_cell_type() {
    const cell_type =
      sel_ids.size > 1 ? "multi" : cells.getIn([cur_id, "cell_type"], "code");
    const title = cell_type_title(cell_type);

    return (
      /* The ButtonGroup is for consistent spacing relative to
         all of the other ButtonGroups. */
      <ButtonGroup>
        <DropdownMenu
          style={{ height: "34px" }}
          cocalc-test={"jupyter-cell-type-dropdown"}
          button={true}
          key={"cell-type"}
          title={title}
          disabled={read_only}
          onClick={cell_select_type}
        >
          <MenuItem cocalc-test={"code"} key={"code"}>
            {cell_type_title("code")}
          </MenuItem>
          <MenuItem cocalc-test={"markdown"} key={"markdown"}>
            {cell_type_title("markdown")}
          </MenuItem>
          <MenuItem cocalc-test={"raw"} key={"raw"}>
            {cell_type_title("raw")}
          </MenuItem>
          <MenuItem cocalc-test={"multi"} key={"multi"} disabled>
            {cell_type_title("multi")}
          </MenuItem>
        </DropdownMenu>
      </ButtonGroup>
    );
  }

  function render_keyboard() {
    return render_button("0", "show keyboard shortcuts");
  }

  function render_close_and_halt() {
    const obj = {
      name: "close and halt",
      disabled: false,
      label: <VisibleMDLG>Halt</VisibleMDLG>,
    };
    return render_button("close and halt", obj);
  }

  function render_group_assistant_halt(): JSX.Element {
    return (
      <ButtonGroup className="hidden-xs">{render_close_and_halt()}</ButtonGroup>
    );
  }

  function render_generate_student_version(): JSX.Element | undefined {
    if (cell_toolbar != "create_assignment") return;
    const assign = {
      name: "nbgrader assign",
      disabled: false,
      label: "Generate student version...",
    };
    return render_button("nbgrader assign", assign);
  }

  function render_nbgrader(): JSX.Element {
    const validate = {
      name: "nbgrader validate",
      disabled: false,
      label: "Validate",
    };
    return (
      <ButtonGroup style={{ marginLeft: "5px" }}>
        {render_button("nbgrader validate", validate)}
        {render_generate_student_version()}
      </ButtonGroup>
    );
  }

  return (
    <Form inline style={{ whiteSpace: "nowrap" }}>
      {render_add_cell()}
      <span style={{ marginLeft: "5px" }} />
      {render_group_move()}
      <span style={{ marginLeft: "5px" }} />
      {render_group_run()}
      <span style={{ marginLeft: "5px" }} />
      {render_select_cell_type()}
      <span style={{ marginLeft: "5px" }} />
      {render_keyboard()}
      <span style={{ marginLeft: "5px" }} />
      {render_group_assistant_halt()}
      {render_nbgrader()}
    </Form>
  );
});
