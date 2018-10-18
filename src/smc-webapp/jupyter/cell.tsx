/*
React component that describes a single cell
*/

import { React, Component, rclass, rtypes } from "../app-framework"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";
const misc_page = require("../misc_page"); // TODO: import type
const { COLORS } = require("smc-util/theme"); // TODO: import type
const misc = require("smc-util/misc"); // TODO: import type
const { Icon, Tip } = require("../r_misc"); // TODO: import type
const { CellInput } = require("./cell-input"); // TODO: import type
const { CellOutput } = require("./cell-output"); // TODO: import type

interface CellProps {
  actions?: any;
  id: string;
  cm_options: any;
  cell: ImmutableMap<any, any>; // TODO: types
  is_current?: boolean;
  is_selected?: boolean;
  is_markdown_edit?: boolean;
  mode: "edit" | "escape";
  font_size?: number;
  project_id?: string;
  directory?: string;
  complete?: ImmutableMap<any, any>; // TODO: types
  is_focused?: boolean;
  more_output?: ImmutableMap<any, any>; // TODO: types
  cell_toolbar?: string;
  trust?: boolean;
  editable?: boolean;
  deleteable?: boolean;
  student_mode?: boolean;
}

export class Cell extends Component<CellProps> {
  shouldComponentUpdate(nextProps) {
    return (
      // note: we assume project_id and directory don't change
      misc.is_different(
        this.props,
        nextProps,
        [
          "id",
          "cm_options",
          "cell",
          "is_current",
          "is_selected",
          "is_markdown_edit",
          "mode",
          "font_size",
          "is_focused",
          "more_output",
          "cell_toolbar",
          "student_mode",
          "trust",
          "editable",
          "deleteable"
        ]
      ) ||
      // only worry about complete when editing this cell
      (nextProps.complete !== this.props.complete &&
        (nextProps.is_current || this.props.is_current))
    );
  }

  render_cell_input(cell: any) {
    return (
      <CellInput
        key="in"
        cell={cell}
        actions={this.props.actions}
        cm_options={this.props.cm_options}
        is_markdown_edit={this.props.is_markdown_edit}
        is_focused={this.props.is_current && this.props.mode === "edit"}
        is_current={this.props.is_current}
        id={this.props.id}
        font_size={this.props.font_size}
        project_id={this.props.project_id}
        directory={this.props.directory}
        complete={this.props.is_current ? this.props.complete : undefined}
        cell_toolbar={this.props.cell_toolbar}
        trust={this.props.trust}
        student_mode={this.props.student_mode}
        is_readonly={!this.props.editable}
      />
    );
  }

  render_cell_output(cell: any) {
    return (
      <CellOutput
        key="out"
        cell={cell}
        actions={this.props.actions}
        id={this.props.id}
        project_id={this.props.project_id}
        directory={this.props.directory}
        more_output={this.props.more_output}
        trust={this.props.trust}
      />
    );
  }

  click_on_cell = (event: any) => {
    if (this.props.actions == null) {
      return;
    }
    if (event.shiftKey && !this.props.is_current) {
      misc_page.clear_selection();
      return this.props.actions.select_cell_range(this.props.id);
    }
    this.props.actions.set_cur_id(this.props.id);
    this.props.actions.unselect_all_cells();
  };

  render_hook() {
    if (this.props.is_current && this.props.actions != null) {
      return <Hook name={this.props.actions.name} />;
    }
  }

  double_click = (event: any) => {
    if (this.props.actions == null) {
      return;
    }
    if (!this.props.editable) {
      return;
    }
    if (this.props.cell.get("cell_type") !== "markdown") {
      return;
    }
    this.props.actions.unselect_all_cells();
    const id = this.props.cell.get("id");
    this.props.actions.set_md_cell_editing(id);
    this.props.actions.set_cur_id(id);
    this.props.actions.set_mode("edit");
    return event.stopPropagation();
  };

  render_metadata_state_delete_protected() {
    if (this.props.deleteable) {
      return;
    }
    const lock_style = { marginRight: "5px" };
    return (
      <Tip
        title={"Protected from deletion"}
        placement={"right"}
        size={"small"}
        style={lock_style}
      >
        <Icon name="ban" />
      </Tip>
    );
  }

  render_metadata_state_edit_protected() {
    if (this.props.editable) {
      return;
    }
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

  render_metadata_state() {
    const style: React.CSSProperties = {
      position: "absolute",
      top: "2px",
      left: "5px",
      color: COLORS.GRAY_L,
      whiteSpace: "nowrap"
    };

    if (this.props.is_current || this.props.is_selected) {
      style.color = COLORS.BS_RED;
    }

    return (
      <div style={style}>
        {this.render_metadata_state_delete_protected()}
        {this.render_metadata_state_edit_protected()}
      </div>
    );
  }

  render() {
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
      >
        {this.render_hook()}
        {this.render_metadata_state()}
        {this.render_cell_input(this.props.cell)}
        {this.render_cell_output(this.props.cell)}
      </div>
    );
  }
}
/*
VISIBLE_STYLE =
    position   : 'absolute'
    color      : '#ccc'
    fontSize   : '6pt'
    paddingTop : '5px'
    right      : '-10px'
    zIndex     : 10
*/

const NOT_VISIBLE_STYLE: React.CSSProperties = {
  position: "absolute",
  fontSize: 0,
  zIndex: -100
};

// TODO: type?

interface HookReactProps {
  name: string;
}

interface HookReduxProps {
  hook_offset?: number;
  mode?: string;
}

class Hook0 extends Component<HookReactProps & HookReduxProps> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        hook_offset: rtypes.number,
        mode: rtypes.string
      }
    };
  }
  render() {
    const style = misc.copy(NOT_VISIBLE_STYLE);
    style.top = this.props.mode === "edit" ? this.props.hook_offset : undefined;
    return (
      <div style={style} className="cocalc-jupyter-hook">
        &nbsp;
      </div>
    );
  }
}

const Hook = rclass<HookReactProps>(Hook0);
