/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
React component that describes a single cell
*/

import { Map } from "immutable";
import { useState } from "react";

import {
  CSS,
  React,
  Rendered,
  useDelayedRender,
} from "@cocalc/frontend/app-framework";
import { Icon, Tip } from "@cocalc/frontend/components";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { clear_selection } from "@cocalc/frontend/misc/clear-selection";
import { LLMTools } from "@cocalc/jupyter/types";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "./browser-actions";
import { CellInput } from "./cell-input";
import { CellOutput } from "./cell-output";
import { InsertCell } from "./insert-cell";
import { Position } from "./insert-cell/types";
import { NBGraderMetadata } from "./nbgrader/cell-metadata";
import { INPUT_PROMPT_COLOR } from "./prompt/base";

interface Props {
  cell: Map<string, any>; // TODO: types
  stdin?;
  cm_options: Map<string, any>;
  mode: "edit" | "escape";
  font_size: number;
  id?: string; // redundant, since it's in the cell.
  actions?: JupyterActions;
  index?: number; // position of cell in the list of all cells; just used to optimize rendering and for no other reason.
  is_current?: boolean;
  is_selected?: boolean;
  is_markdown_edit?: boolean;
  project_id?: string;
  path?: string;
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
  llmTools?: LLMTools;
  computeServerId?: number;
  is_visible?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  dragHandle?: React.JSX.Element;
  read_only?: boolean;
  isDragging?: boolean;
  isPending?: boolean;
  name?: string;
}

function areEqual(props: Props, nextProps: Props): boolean {
  // note: we assume project_id and directory don't change
  return !(
    nextProps.id !== props.id ||
    nextProps.stdin !== props.stdin ||
    nextProps.index !== props.index ||
    nextProps.cm_options !== props.cm_options ||
    nextProps.cell !== props.cell ||
    nextProps.is_current !== props.is_current ||
    nextProps.is_selected !== props.is_selected ||
    nextProps.is_markdown_edit !== props.is_markdown_edit ||
    nextProps.mode !== props.mode ||
    nextProps.font_size !== props.font_size ||
    nextProps.is_focused !== props.is_focused ||
    nextProps.is_visible !== props.is_visible ||
    nextProps.more_output !== props.more_output ||
    nextProps.cell_toolbar !== props.cell_toolbar ||
    nextProps.trust !== props.trust ||
    nextProps.is_scrolling !== props.is_scrolling ||
    nextProps.height !== props.height ||
    nextProps.isFirst !== props.isFirst ||
    nextProps.isLast !== props.isLast ||
    nextProps.computeServerId !== props.computeServerId ||
    (nextProps.llmTools?.model ?? "") !== (props.llmTools?.model ?? "") ||
    (nextProps.complete !== props.complete && // only worry about complete when editing this cell
      (nextProps.is_current || props.is_current)) ||
    nextProps.dragHandle !== props.dragHandle ||
    nextProps.read_only !== props.read_only ||
    nextProps.isDragging !== props.isDragging ||
    nextProps.isPending !== props.isPending
  );
}

export const Cell: React.FC<Props> = React.memo((props: Props) => {
  const [showAICellGen, setShowAICellGen] = useState<Position>(null);
  const id: string = props.id ?? props.cell.get("id");
  const frameActions = useNotebookFrameActions();
  const render = useDelayedRender(props.delayRendering ?? 0);

  if (!render) {
    return <></>;
  }

  function is_deletable(): boolean {
    return props.cell.getIn(["metadata", "deletable"], true) as any;
  }

  function nbgrader_state(): undefined | Map<string, any> {
    return props.cell.getIn(["metadata", "nbgrader"]) as any;
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
        is_readonly={!!props.read_only}
        input_is_readonly={!props.cell.getIn(["metadata", "editable"], true)}
        is_scrolling={props.is_scrolling}
        llmTools={props.llmTools}
        computeServerId={props.computeServerId}
        setShowAICellGen={setShowAICellGen}
        dragHandle={props.dragHandle}
        isPending={props.isPending}
      />
    );
  }

  function render_cell_output(cell: Map<string, any>): Rendered {
    if (props.cell.get("cell_type") == "markdown") {
      // markdown doesn't ever display output -- see
      // https://github.com/sagemathinc/cocalc/issues/6506
      return;
    }
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
        llmTools={props.llmTools}
        isDragging={props.isDragging}
        stdin={props.stdin}
      />
    );
  }

  function click_on_cell(event: any): void {
    if (event.shiftKey && !props.is_current) {
      clear_selection();
      frameActions.current?.select_cell_range(id);
      return;
    }
    frameActions.current?.set_mode("escape");
    frameActions.current?.set_cur_id(id);
    frameActions.current?.unselect_all_cells();
  }

  function double_click(event: any): void {
    if (props.read_only) {
      return;
    }
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
      <Tip title={"Protected from deletion"} placement={"right"} size={"small"}>
        <Icon name="ban" />
      </Tip>
    );
  }

  function render_not_editable(): Rendered {
    if (props.read_only || !props.cell.getIn(["metadata", "editable"], true)) {
      return (
        <Tip
          title={"Protected from modifications"}
          placement={"right"}
          size={"small"}
        >
          <Icon name="lock" />
        </Tip>
      );
    }
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

  function getBorderColor(): string {
    if (props.is_current) {
      // is the current cell
      if (props.mode === "edit") {
        // edit mode
        return "#66bb6a";
      } else {
        // escape mode
        if (props.is_focused) {
          return "#42a5f5";
        } else {
          return "#42a5ff";
        }
      }
    } else {
      if (props.is_selected) {
        return "#e3f2fd";
      } else {
        return "transparent";
      }
    }
  }

  function getCellStyle(): CSS {
    const color = getBorderColor();

    // 30px -- make room for InsertCell(above)
    const marginTop = props.isFirst
      ? "30px"
      : props.actions != null
        ? "10px"
        : "20px";

    const style: React.CSSProperties = {
      border: `1px solid ${color}`,
      borderLeft: `10px solid ${color}`,
      borderRight: `10px solid ${color}`,
      borderRadius: "10px",
      position: "relative",
      // The bigger top margin when in fully read only mode (no props.actions,
      // e.g., timetravel view) is to deal with the fact that the insert cell
      // bar isn't rendered, but some of the controls off
      // to the right assume it is.
      // The bigger BOTTOM margin when no output is because otherwise the big
      // top margin makes things look very weirdly unbalanced.
      ...(props.cell.get("output") || props.actions == null
        ? {
            padding: "2px",
            margin:
              props.actions != null
                ? `${marginTop} 15px 2px 5px`
                : `${marginTop} 15px 2px 5px`,
          }
        : {
            padding: "2px 2px 15px 2px",
            margin:
              props.actions != null
                ? `${marginTop} 15px -15px 5px`
                : `${marginTop} 15px -15px 5px`,
          }),
    };

    if (props.is_selected) {
      style.background = "#e3f2fd";
    }

    return style;
  }

  function render_metadata_state(): Rendered {
    if (props.read_only) {
      return;
    }
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
        top: 0,
        left: "2px",
        whiteSpace: "nowrap",
        color: COLORS.GRAY_L,
      };
    } else {
      // Need arbitrarily much horizontal space, so we
      // get our own line.
      style = {
        color: COLORS.GRAY_L,
        marginBottom: "5px",
        top: 0,
        left: "2px",
      };
    }
    if (props.cell.get("cell_type") == "markdown") {
      // move down to avoid overlap with drag handle
      style = { ...style, top: "20px" };
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

  function render_insert_cell(
    position: "above" | "below" = "above",
  ): React.JSX.Element | null {
    if (props.actions == null || IS_TOUCH) {
      return null;
    }
    if (position === "above" && !props.isFirst) {
      return null;
    }
    return (
      <InsertCell
        id={id}
        project_id={props.project_id}
        hide={!props.is_visible}
        llmTools={props.llmTools}
        key={id + "insert" + position}
        position={position}
        actions={props.actions}
        showAICellGen={
          showAICellGen === position ||
          (position === "below" && showAICellGen === "replace")
            ? showAICellGen
            : null
        }
        setShowAICellGen={setShowAICellGen}
        alwaysShow={position === "below" && props.isLast}
      />
    );
  }

  // Note that the cell id is used for scroll functionality, so *is* important.
  return (
    <>
      {!props.read_only && render_insert_cell("above")}
      <div
        style={getCellStyle()}
        onMouseUp={props.is_current ? undefined : click_on_cell}
        onDoubleClick={double_click}
        id={id}
        cocalc-test={"jupyter-cell"}
      >
        {render_metadata_state()}
        {render_cell_input(props.cell)}
        {render_cell_output(props.cell)}
      </div>
      {!props.read_only && render_insert_cell("below")}
    </>
  );
}, areEqual);
