/*
React component that describes a single cell

        editable={cell.getIn(["metadata", "editable"], true)}
        deletable={cell.getIn(["metadata", "deletable"], true)}
        nbgrader={cell.getIn(["metadata", "nbgrader"])}

*/

import { React, Component, Rendered } from "../app-framework";
import { Map } from "immutable";

const misc_page = require("../misc_page"); // TODO: import type

import { COLORS } from "smc-util/theme";
import { INPUT_PROMPT_COLOR } from "./prompt";
import { Icon } from "../r_misc/icon";
import { Tip } from "../r_misc/tip";
import { CellInput } from "./cell-input";
import { CellOutput } from "./cell-output";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

import { NBGraderMetadata } from "./nbgrader/cell-metadata";

interface CellProps {
  actions?: JupyterActions;
  frame_actions?: NotebookFrameActions;
  name?: string;
  id: string;
  index: number;
  cm_options: Map<string, any>;
  cell: Map<string, any>; // TODO: types
  is_current?: boolean;
  is_selected?: boolean;
  is_markdown_edit?: boolean;
  mode: "edit" | "escape";
  font_size: number;
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
}

export class Cell extends Component<CellProps> {
  public shouldComponentUpdate(nextProps: CellProps): boolean {
    // note: we assume project_id and directory don't change
    return !!(
      nextProps.id !== this.props.id ||
      nextProps.index !== this.props.index ||
      nextProps.cm_options !== this.props.cm_options ||
      nextProps.cell !== this.props.cell ||
      nextProps.is_current !== this.props.is_current ||
      nextProps.is_selected !== this.props.is_selected ||
      nextProps.is_markdown_edit !== this.props.is_markdown_edit ||
      nextProps.mode !== this.props.mode ||
      nextProps.font_size !== this.props.font_size ||
      nextProps.is_focused !== this.props.is_focused ||
      nextProps.more_output !== this.props.more_output ||
      nextProps.cell_toolbar !== this.props.cell_toolbar ||
      nextProps.trust !== this.props.trust ||
      nextProps.is_scrolling !== this.props.is_scrolling ||
      nextProps.height !== this.props.height ||
      (nextProps.complete !== this.props.complete &&
        (nextProps.is_current || this.props.is_current))
    );
  } // only worry about complete when editing this cell

  private is_editable(): boolean {
    return this.props.cell.getIn(["metadata", "editable"], true);
  }

  private is_deletable(): boolean {
    return this.props.cell.getIn(["metadata", "deletable"], true);
  }

  private nbgrader(): undefined | Map<string, any> {
    return this.props.cell.getIn(["metadata", "nbgrader"]);
  }

  private render_cell_input(cell: Map<string, any>): Rendered {
    return (
      <CellInput
        key="in"
        cell={cell}
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        cm_options={this.props.cm_options}
        is_markdown_edit={!!this.props.is_markdown_edit}
        is_focused={!!(this.props.is_current && this.props.mode === "edit")}
        is_current={!!this.props.is_current}
        id={this.props.id}
        index={this.props.index}
        font_size={this.props.font_size}
        project_id={this.props.project_id}
        directory={this.props.directory}
        complete={this.props.is_current ? this.props.complete : undefined}
        cell_toolbar={this.props.cell_toolbar}
        trust={this.props.trust}
        is_readonly={!this.is_editable()}
        is_scrolling={this.props.is_scrolling}
      />
    );
  }

  private render_cell_output(cell: Map<string, any>): Rendered {
    return (
      <CellOutput
        key="out"
        cell={cell}
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        name={this.props.name}
        id={this.props.id}
        project_id={this.props.project_id}
        directory={this.props.directory}
        more_output={this.props.more_output}
        trust={this.props.trust}
        complete={this.props.is_current && this.props.complete != null}
      />
    );
  }

  private click_on_cell = (event: any): void => {
    if (this.props.frame_actions == null) {
      return;
    }
    if (event.shiftKey && !this.props.is_current) {
      misc_page.clear_selection();
      this.props.frame_actions.select_cell_range(this.props.id);
      return;
    }
    this.props.frame_actions.set_cur_id(this.props.id);
    this.props.frame_actions.unselect_all_cells();
  };

  private double_click = (event: any): void => {
    if (this.props.frame_actions == null) {
      return;
    }
    if (this.props.cell.getIn(["metadata", "editable"]) === false) {
      return;
    }
    if (this.props.cell.get("cell_type") !== "markdown") {
      return;
    }
    this.props.frame_actions.unselect_all_cells();
    const id = this.props.cell.get("id");
    this.props.frame_actions.set_md_cell_editing(id);
    this.props.frame_actions.set_cur_id(id);
    this.props.frame_actions.set_mode("edit");
    event.stopPropagation();
  };

  private render_not_deletable(): Rendered {
    if (this.is_deletable()) return;
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

  private render_not_editable(): Rendered {
    if (this.is_editable()) return;
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

  private render_nbgrader(): Rendered {
    const nbgrader = this.nbgrader();
    if (nbgrader == null) return;
    return (
      <span>
        <Icon name="graduation-cap" style={{ marginRight: "5px" }} />
        <NBGraderMetadata
          nbgrader={nbgrader}
          start={this.props.cell.get("start")}
          state={this.props.cell.get("state")}
          output={this.props.cell.get("output")}
        />
      </span>
    );
  }

  private render_metadata_state(): Rendered {
    let style: React.CSSProperties;

    // note -- that second part is because the official
    // nbgrader demo has tons of cells with all the metadata
    // empty... which *cocalc* would not produce, but
    // evidently official tools do.
    const nbgrader = this.nbgrader();
    const no_nbgrader: boolean =
      nbgrader == null ||
      (!nbgrader.get("grade") &&
        !nbgrader.get("solution") &&
        !nbgrader.get("locked"));
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
        color: COLORS.GRAY_L
      };
    } else {
      // Need arbitrarily much horizontal space, so we
      // get our own line.
      style = { color: COLORS.GRAY_L, marginBottom: "5px" };
    }

    if (this.props.is_current || this.props.is_selected) {
      // style.color = COLORS.BS_RED;
      style.color = INPUT_PROMPT_COLOR; // should be the same as the prompt; it's not an error.
    }

    if (this.props.height) {
      style.height = this.props.height + "px";
      style.overflowY = "scroll";
    }

    return (
      <div style={style}>
        {this.render_not_deletable()}
        {this.render_not_editable()}
        {no_nbgrader ? undefined : this.render_nbgrader()}
      </div>
    );
  }

  public render(): Rendered {
    let color1: string, color2: string;
    if (this.props.is_current) {
      // is the current cell
      if (this.props.mode === "edit") {
        // edit mode
        color1 = color2 = "#66bb6a";
      } else {
        // escape mode
        if (this.props.is_focused) {
          color1 = "#ababab";
          color2 = "#42a5f5";
        } else {
          color1 = "#eee";
          color2 = "#42a5ff";
        }
      }
    } else {
      if (this.props.is_selected) {
        color1 = color2 = "#e3f2fd";
      } else {
        color1 = color2 = "white";
      }
    }
    const style: React.CSSProperties = {
      border: `1px solid ${color1}`,
      borderLeft: `5px solid ${color2}`,
      padding: "2px 5px",
      position: "relative"
    };

    if (this.props.is_selected) {
      style.background = "#e3f2fd";
    }

    // Note that the cell id is used for the cell-list.cjsx scroll functionality.
    return (
      <div
        style={style}
        onMouseUp={this.props.is_current ? undefined : this.click_on_cell}
        onDoubleClick={this.double_click}
        id={this.props.id}
        cocalc-test={"jupyter-cell"}
      >
        {this.render_metadata_state()}
        {this.render_cell_input(this.props.cell)}
        {this.render_cell_output(this.props.cell)}
      </div>
    );
  }
}
