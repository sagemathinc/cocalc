/*
The static buttonbar at the top.
*/

import { React, Component, rclass, rtypes, Rendered } from "../app-framework"; // TODO: this will move
import * as immutable from "immutable";
import { Button, ButtonGroup, Form, FormControl } from "react-bootstrap";
const { Icon, VisibleMDLG, VisibleLG } = require("../r_misc");
import { endswith } from "smc-util/misc2";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

interface TopButtonbarProps {
  // OWN PROPS
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  cur_id: string; // id of currently selected cell
  sel_ids: immutable.Set<any>; // set of selected cells
  cells: immutable.Map<any, any>; // map from id to cells

  // REDUX PROPS
  // [name]
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  read_only: boolean;
  kernel_state: string;
  kernel_usage: immutable.Map<any, any>;

  //page
  fullscreen: string;
}

export class TopButtonbar0 extends Component<TopButtonbarProps> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        has_unsaved_changes: rtypes.bool,
        has_uncommitted_changes: rtypes.bool,
        read_only: rtypes.bool,
        kernel_state: rtypes.string,
        kernel_usage: rtypes.immutable.Map
      },
      page: {
        fullscreen: rtypes.string
      }
    };
  }

  focus = () => {
    this.props.frame_actions.focus(true);
  };

  shouldComponentUpdate(nextProps) {
    return (
      nextProps.cur_id !== this.props.cur_id ||
      nextProps.cells.getIn([this.props.cur_id, "cell_type"]) !==
        this.props.cells.getIn([this.props.cur_id, "cell_type"]) ||
      nextProps.has_unsaved_changes !== this.props.has_unsaved_changes ||
      nextProps.read_only !== this.props.read_only ||
      nextProps.has_uncommitted_changes !==
        this.props.has_uncommitted_changes ||
      nextProps.kernel_state !== this.props.kernel_state ||
      nextProps.kernel_usage !== this.props.kernel_usage
    );
  }

  command(name: string, focus: boolean): (event?) => void {
    return (_event?): void => {
      $(":focus").blur(); // battling with react-bootstrap stupidity... ?
      this.props.frame_actions.command(name);
      if (focus) {
        this.focus();
      } else {
        this.props.frame_actions.blur();
      }
    };
  }

  render_button(key: any, name: any) {
    // TODO: this is weird and confusing.
    let className: string | undefined;
    let disabled = false;
    let label = "";
    let style: any;
    if (typeof name === "object") {
      var name;
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
    if (this.props.read_only) {
      // all buttons disabled in read-only mode
      disabled = true;
    }
    const obj = this.props.frame_actions.commands[name];
    if (obj == null) {
      throw Error(`command ${name} is not defined`);
    }
    let icon: Rendered;
    const focus: boolean = !endswith(obj.m ? obj.m : "", "...");
    if (obj.i) {
      icon = <Icon name={obj.i} />;
    }
    return (
      <Button
        className={className}
        key={key}
        onClick={this.command(name, focus)}
        title={obj.m}
        disabled={disabled}
        style={style}
      >
        {icon} {label}
      </Button>
    );
  }

  render_buttons(names: any) {
    const result: any[] = [];
    for (let key in names) {
      const name = names[key];
      result.push(this.render_button(key, name));
    }
    return result;
  }

  render_button_group(names: any, hide_xs?: any) {
    return (
      <ButtonGroup className={hide_xs ? "hidden-xs" : ""}>
        {this.render_buttons(names)}
      </ButtonGroup>
    );
  }

  render_add_cell() {
    return this.render_buttons(["insert cell below"]);
  }

  render_group_edit() {
    return this.render_button_group(
      [
        "cut cell",
        "copy cell",
        "paste cell and replace",
        { name: "format cells" }
      ],
      true
    );
  }

  render_group_move() {
    return (
      <VisibleLG>
        {this.render_button_group(["move cell up", "move cell down"], true)}
      </VisibleLG>
    );
  }

  render_group_run() {
    let stop_style: React.CSSProperties | undefined;
    const cpu_usage =
      (this.props.kernel_usage && this.props.kernel_usage.get("cpu")) || 0;
    if (cpu_usage > 50) {
      stop_style = { backgroundColor: "rgb(92,184,92)", color: "white" };
    }

    return this.render_button_group([
      { name: "run cell and select next" },
      { name: "interrupt kernel", style: stop_style },
      "confirm restart kernel",
      "confirm restart kernel and run all cells",
      { name: "tab key", label: "tab" }
    ]);
  }

  cell_select_type(event: any): void {
    this.props.frame_actions.set_selected_cell_type(event.target.value);
    this.focus();
  }

  render_select_cell_type() {
    let cell_type: any;
    if (this.props.sel_ids.size > 1) {
      cell_type = "multi";
    } else {
      cell_type = this.props.cells.getIn(
        [this.props.cur_id, "cell_type"],
        "code"
      );
    }
    return (
      <FormControl
        componentClass="select"
        placeholder="select"
        onChange={this.cell_select_type}
        className="hidden-xs"
        style={{ maxWidth: "8em" }}
        disabled={this.props.read_only}
        value={cell_type}
      >
        <option value="code">Code</option>
        <option value="markdown">Markdown</option>
        <option value="raw">Raw</option>
        <option value="multi" disabled>
          -
        </option>
      </FormControl>
    );
  }

  render_keyboard() {
    return this.render_button("0", "show keyboard shortcuts");
  }

  render_assistant() {
    return this.render_button("assistant", {
      name: "show code assistant",
      label: <VisibleMDLG>Assistant</VisibleMDLG>
    });
  }

  // TODO -- should just be a frame at some point.
  render_switch_button() {
    // TODO: does "$" have a "browser" property?
    if (this.props.fullscreen === "kiosk" || ($ as any).browser.firefox) {
      return;
    }
    return (
      <Button
        title="Switch to classical notebook"
        onClick={() => this.props.actions.switch_to_classical_notebook()}
      >
        <Icon name="exchange" />{" "}
        <span className="hidden-sm">Classical notebook...</span>
      </Button>
    );
  }

  render_close_and_halt() {
    const obj = {
      name: "close and halt",
      disabled: false,
      label: <VisibleMDLG>Halt</VisibleMDLG>
    };
    return this.render_button("close and halt", obj);
  }

  render() {
    return (
      <div style={{ margin: "1px 1px 0px 1px", backgroundColor: "#fff" }}>
        <Form inline style={{ whiteSpace: "nowrap" }}>
          {this.render_add_cell()}
          <span style={{ marginLeft: "5px" }} />
          {this.render_group_move()}
          <span style={{ marginLeft: "5px" }} />
          {this.render_group_run()}
          <span style={{ marginLeft: "5px" }} />
          {this.render_select_cell_type()}
          <span style={{ marginLeft: "5px" }} />
          {this.render_keyboard()}
        </Form>
      </div>
    );
  }
}

export const TopButtonbar = rclass(TopButtonbar0);
