/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
nbgrader functionality: the create assignment toolbar.
<Form inline>
  <FormGroup controlId="formInlineName">
*/

import {
  Button,
  FormControl,
  FormGroup,
  ControlLabel,
  Form,
} from "react-bootstrap";
import { Map } from "immutable";

import { React, Component, Rendered } from "../../app-framework";

import { Icon } from "../../r_misc/icon";

import { JupyterActions } from "../browser-actions";

import { Metadata } from "./types";

import { popup } from "../../frame-editors/frame-tree/print";

import { debounce } from "lodash";

import {
  CELLTYPE_INFO_LIST,
  CELLTYPE_INFO_MAP,
  value_to_state,
  state_to_value,
  value_to_template_content,
} from "./cell-types";

const OPTIONS_CODE: Rendered[] = [];
const OPTIONS_NOTCODE: Rendered[] = [];

for (const x of CELLTYPE_INFO_LIST) {
  const option = (
    <option key={x.value} value={x.value}>
      {x.title}
    </option>
  );
  if (!x.markdown_only) {
    OPTIONS_CODE.push(option);
  }
  if (!x.code_only) {
    OPTIONS_NOTCODE.push(option);
  }
}
console.log(OPTIONS_CODE);

interface CreateAssignmentProps {
  actions: JupyterActions;
  cell: Map<string, any>;
}

export class CreateAssignmentToolbar extends Component<CreateAssignmentProps> {
  private focus_points: boolean = false;

  private select(value: string): void {
    if (value == "") {
      // clearing state
      this.props.actions.nbgrader_actions.set_metadata(
        this.props.cell.get("id")
      );
      return;
    }
    const metadata: Metadata = value_to_state(value);
    metadata.grade_id = this.props.cell.getIn(
      ["metadata", "nbgrader", "grade_id"],
      ""
    );
    if (!metadata.grade_id) {
      // TODO -- check if default is globally unique...?
      metadata.grade_id = this.props.cell.get("id");
    }
    this.props.actions.nbgrader_actions.set_metadata(
      this.props.cell.get("id"),
      metadata
    );

    if (this.props.cell.get("input", "").trim() == "") {
      const language: string = this.props.actions.store.get_kernel_language();
      const input = value_to_template_content(
        value,
        language,
        this.props.cell.get("cell_type", "code")
      );
      if (input != "") {
        this.props.actions.set_cell_input(this.props.cell.get("id"), input);
      }
    }
  }

  private set_points = debounce((points) => {
    this.focus_points = true;
    points = parseFloat(points);
    if (!Number.isFinite(points) || points < 0) {
      points = 0;
    }
    this.props.actions.nbgrader_actions.set_metadata(
      this.props.cell.get("id"),
      { points }
    );
  }, 1000);

  private get_value(): string {
    const x = this.props.cell.getIn(["metadata", "nbgrader"], Map());
    if (x == null) return "";
    try {
      return state_to_value(x.toJS());
    } catch (err) {
      this.select(""); // clear all the metadata.
      return "";
    }
  }

  private render_icon(value: string): Rendered {
    const name = CELLTYPE_INFO_MAP[value]?.icon;
    if (name == null) return;
    return <Icon name={name} style={{ float: "left", padding: "5px" }} />;
  }

  private render_points(): Rendered {
    const points: number | undefined = this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "points",
    ]);
    if (points == null) return;
    const focus_points = this.focus_points;
    this.focus_points = false;
    return (
      <FormGroup>
        <ControlLabel style={{ fontWeight: 400 }}>Points:</ControlLabel>
        <FormControl
          type="number"
          autoFocus={focus_points}
          defaultValue={`${points}`}
          onChange={(e) => this.set_points((e.target as any).value)}
          style={{
            color: "#666",
            width: "10ex",
            marginLeft: "5px",
            fontSize: "14px",
          }}
        />
      </FormGroup>
    );
  }

  private set_grade_id(grade_id: string): void {
    // TODO: check globally unique...?
    // DO NOT allow whitespace (see https://github.com/sagemathinc/cocalc/issues/4743):
    grade_id = grade_id.replace(/\s+/g, "");
    this.props.actions.nbgrader_actions.set_metadata(
      this.props.cell.get("id"),
      { grade_id }
    );
  }

  private render_id(): Rendered {
    const grade_id: string | undefined = this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "grade_id",
    ]);
    if (grade_id == null) return;
    return (
      <FormGroup>
        <ControlLabel style={{ marginLeft: "15px", fontWeight: 400 }}>
          ID:
        </ControlLabel>
        <input
          spellCheck={false}
          type="input"
          value={grade_id}
          onChange={(e) => this.set_grade_id((e.target as any).value)}
          style={{
            width: `${grade_id.length <= 6 ? 64 : 180}px`,
            marginLeft: "10px",
            paddingLeft: "5px",
            color: "#666",
            fontSize: "14px",
          }}
        />
      </FormGroup>
    );
  }

  private render_dropdown(): Rendered {
    const options =
      this.props.cell.get("cell_type", "code") == "code"
        ? OPTIONS_CODE
        : OPTIONS_NOTCODE;
    return (
      <FormControl
        componentClass="select"
        placeholder="select"
        onChange={(e) => this.select((e as any).target.value)}
        value={this.get_value()}
        style={{ marginLeft: "15px" }}
      >
        {options}
      </FormControl>
    );
  }

  private click_help(): void {
    const value = this.get_value();
    const info = CELLTYPE_INFO_MAP[value];
    if (info == null || info.link == null) return;
    popup(info.link, 750);
  }

  private render_help(): Rendered {
    const value = this.get_value();
    const info = CELLTYPE_INFO_MAP[value];
    if (info == null) return;
    return (
      <Button
        onClick={() => this.click_help()}
        style={{ marginLeft: "15px" }}
        title={info.hover}
      >
        <Icon name="question-circle" />
      </Button>
    );
  }

  render() {
    const value = this.get_value();
    let background: string;
    let color: string;
    if (value == "" || value == "readonly") {
      color = "#000";
      background = "#eee";
    } else {
      color = "#fff";
      background = "#337ab7";
    }
    return (
      <div style={{ width: "100%", background, color, padding: "3px" }}>
        {this.render_icon(value)}
        <Form inline style={{ float: "right" }}>
          {this.render_points()}
          {this.render_id()}
          {this.render_dropdown()}
          {this.render_help()}
        </Form>
      </div>
    );
  }
}
