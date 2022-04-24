/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that describes a single cella
*/

import { Map } from "immutable";
import { React, Rendered, useDelayedRender } from "../app-framework";
import { clear_selection } from "../misc/clear-selection";
import { COLORS } from "@cocalc/util/theme";
import { INPUT_PROMPT_COLOR } from "./prompt/base";
import { Icon, Tip } from "../components";
import { CellInput } from "./cell-input";
import { CellOutput } from "./cell-output";

import { JupyterActions } from "./browser-actions";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";

import { NBGraderMetadata } from "./nbgrader/cell-metadata";

interface Props {
  cell: Map<string, any>; // TODO: types
  cm_options: Map<string, any>;
  mode: "edit" | "escape";
  font_size: number;
  id?: string; // redundant, since it's in the cell.
  actions?: JupyterActions;
  name?: string;
  index?: number; // position of cell in the list of all cells; just used to optimize rendering and for no other reason.
  is_current?: boolean;
  is_selected?: boolean;
  is_markdown_edit?: boolean;
  project_id?: string;
  directory?: string;
  complete?: Map<string, any>; // TODO: types
  is_focused?: boolean;
  more_output?: Map<string, any>; // TODO: types
  cell_toolbar?: string;
  trust?: boolean;
  hook_offset?: number;
  is_scrolling?: boolean;
  height?: number; // optional fixed height
  delayRendering?: number;
}

function areEqual(props: Props, nextProps: Props): boolean {
  // note: we assume project_id and directory don't change
  return !(
    nextProps.id !== props.id ||
    nextProps.index !== props.index ||
    nextProps.cm_options !== props.cm_options ||
    nextProps.cell !== props.cell ||
    nextProps.is_current !== props.is_current ||
    nextProps.is_selected !== props.is_selected ||
    nextProps.is_markdown_edit !== props.is_markdown_edit ||
    nextProps.mode !== props.mode ||
    nextProps.font_size !== props.font_size ||
    nextProps.is_focused !== props.is_focused ||
    nextProps.more_output !== props.more_output ||
    nextProps.cell_toolbar !== props.cell_toolbar ||
    nextProps.trust !== props.trust ||
    nextProps.is_scrolling !== props.is_scrolling ||
    nextProps.height !== props.height ||
    (nextProps.complete !== props.complete && // only worry about complete when editing this cell
      (nextProps.is_current || props.is_current))
  );
}

export const Cell: React.FC<Props> = React.memo((props) => {
  const id: string = props.id ?? props.cell.get("id");
  const frameActions = useNotebookFrameActions();
  const render = useDelayedRender(props.delayRendering ?? 0);
  if (!render) {
    return <></>;
  }

  function is_editable(): boolean {
    return props.cell.getIn(["metadata", "editable"], true);
  }

  function is_deletable(): boolean {
    return props.cell.getIn(["metadata", "deletable"], true);
  }

  function nbgrader_state(): undefined | Map<string, any> {
    return props.cell.getIn(["metadata", "nbgrader"]);
  }

  function render_cell_input(cell: Map<string, any>): Rendered {
    return (
      <CellInput
        key="in"
        cell={cell}
        actions={props.actions}
        cm_options={props.cm_options}
        is_markdown_edit={!!props.is_markdown_edit}
        is_focused={!!(props.is_current && props.mode === "edit")}
        is_current={!!props.is_current}
        id={id}
        index={props.index ?? 0}
        font_size={props.font_size}
        project_id={props.project_id}
        directory={props.directory}
        complete={props.is_current ? props.complete : undefined}
        cell_toolbar={props.cell_toolbar}
        trust={props.trust}
        is_readonly={!is_editable()}
        is_scrolling={props.is_scrolling}
      />
    );
  }

  function render_cell_output(cell: Map<string, any>): Rendered {
    return (
      <CellOutput
        key="out"
        cell={cell}
        actions={props.actions}
        name={props.name}
        id={id}
        project_id={props.project_id}
        directory={props.directory}
        more_output={props.more_output}
        trust={props.trust}
        complete={props.is_current && props.complete != null}
      />
    );
  }

  function click_on_cell(event: any): void {
    if (event.shiftKey && !props.is_current) {
      clear_selection();
      frameActions.current?.select_cell_range(id);
      return;
    }
    frameActions.current?.set_cur_id(id);
    frameActions.current?.unselect_all_cells();
  }

  function double_click(event: any): void {
    if (props.cell.getIn(["metadata", "editable"]) === false) {
      return;
    }
    if (props.cell.get("cell_type") !== "markdown") {
      return;
    }
    frameActions.current?.unselect_all_cells();
    const id = props.cell.get("id");
    frameActions.current?.set_md_cell_editing(id);
    frameActions.current?.set_cur_id(id);
    frameActions.current?.set_mode("edit");
    event.stopPropagation();
  }

  function render_not_deletable(): Rendered {
    if (is_deletable()) return;
    return (
      <Tip
        title={"Protected from deletion"}
        placement={"right"}
        size={"small"}
        style={{ marginRight: "5px" }}
      >
        <Icon name="ban" />
      </Tip>
    );
  }

  function render_not_editable(): Rendered {
    if (is_editable()) return;
    return (
      <Tip
        title={"Protected from modifications"}
        placement={"right"}
        size={"small"}
        style={{ marginRight: "5px" }}
      >
        <Icon name="lock" />
      </Tip>
    );
  }

  function render_nbgrader(): Rendered {
    const nbgrader = nbgrader_state();
    if (nbgrader == null) return;
    return (
      <NBGraderMetadata
        nbgrader={nbgrader}
        start={props.cell.get("start")}
        state={props.cell.get("state")}
        output={props.cell.get("output")}
        toolbarIsVisible={!!props.cell_toolbar}
      />
    );
  }

  function render_metadata_state(): Rendered {
    let style: React.CSSProperties;

    // note -- that second part is because the official
    // nbgrader demo has tons of cells with all the metadata
    // empty... which *cocalc* would not produce, but
    // evidently official tools do.
    const nbgrader = nbgrader_state();
    const no_nbgrader: boolean =
      nbgrader == null ||
      (!nbgrader.get("grade") &&
        !nbgrader.get("solution") &&
        !nbgrader.get("locked") &&
        !nbgrader.get("remove"));
    if (no_nbgrader) {
      // Will not need more than two tiny icons.
      // If we add more metadata state indicators
      // that may take a lot of space, check for them
      // in the condition above.
      style = {
        position: "absolute",
        top: "2px",
        left: "5px",
        whiteSpace: "nowrap",
        color: COLORS.GRAY_L,
      };
    } else {
      // Need arbitrarily much horizontal space, so we
      // get our own line.
      style = { color: COLORS.GRAY_L, marginBottom: "5px" };
    }

    if (props.is_current || props.is_selected) {
      // style.color = COLORS.BS_RED;
      style.color = INPUT_PROMPT_COLOR; // should be the same as the prompt; it's not an error.
    }

    if (props.height) {
      style.height = props.height + "px";
      style.overflowY = "scroll";
    }

    return (
      <div style={style}>
        {render_not_deletable()}
        {render_not_editable()}
        {!no_nbgrader && render_nbgrader()}
      </div>
    );
  }

  let color1: string, color2: string;
  if (props.is_current) {
    // is the current cell
    if (props.mode === "edit") {
      // edit mode
      color1 = color2 = "#66bb6a";
    } else {
      // escape mode
      if (props.is_focused) {
        color1 = "#ababab";
        color2 = "#42a5f5";
      } else {
        color1 = "#eee";
        color2 = "#42a5ff";
      }
    }
  } else {
    if (props.is_selected) {
      color1 = color2 = "#e3f2fd";
    } else {
      color1 = color2 = "white";
    }
  }
  const style: React.CSSProperties = {
    border: `1px solid ${color1}`,
    borderLeft: `10px solid ${color2}`,
    padding: "2px 5px",
    position: "relative",
  };

  if (props.is_selected) {
    style.background = "#e3f2fd";
  }

  // Note that the cell id is used for scroll functionality, so *is* important.
  return (
    <div
      style={style}
      onMouseUp={props.is_current ? undefined : click_on_cell}
      onDoubleClick={double_click}
      id={id}
      cocalc-test={"jupyter-cell"}
    >
      {render_metadata_state()}
      {render_cell_input(props.cell)}
      {render_cell_output(props.cell)}
    </div>
  );
}, areEqual);
