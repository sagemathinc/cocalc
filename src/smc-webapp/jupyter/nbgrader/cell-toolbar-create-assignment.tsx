/*
nbgrader functionality: the create assignment toolbar.
<Form inline>
  <FormGroup controlId="formInlineName">
*/

import { FormControl, FormGroup, ControlLabel, Form } from "react-bootstrap";
import { Map } from "immutable";

import { React, Component, Rendered } from "../../app-framework";

import { Icon } from "../../r_misc/icon";

import { JupyterActions } from "../browser-actions";

import { Metadata } from "./types";

const TYPES = [
  { title: "-", value: "", grade: false, locked: false, solution: false },
  {
    title: "Manually graded answer",
    value: "manual",
    icon: "book-reader",
    grade: true,
    locked: false,
    solution: true,
    points: 0
  },
  {
    title: "Autograded answer",
    value: "auto",
    icon: "magic",
    grade: false,
    locked: false,
    solution: true,
    code_only: true
  },
  {
    title: "Autograder tests",
    value: "test",
    icon: "check",
    grade: true,
    locked: true,
    solution: false,
    points: 0,
    code_only: true
  },
  {
    title: "Readonly",
    value: "readonly",
    icon: "lock",
    grade: false,
    locked: true,
    solution: false
  }
];

// I could implement this with another map hardcoded
// in Javascript, but instead use a function with a cache
// since it's more flexible.
const value_cache: { [key: string]: string } = {};
function state_to_value(state: Metadata): string {
  const grade: boolean = !!state.grade;
  const locked: boolean = !!state.locked;
  const solution: boolean = !!state.solution;
  const key = JSON.stringify({ grade, locked, solution });
  if (value_cache[key] != undefined) return value_cache[key];
  for (let x of TYPES) {
    if (x.grade == grade && x.locked == locked && x.solution == solution) {
      value_cache[key] = x.value;
      return x.value;
    }
  }
  throw Error(`invalid state - "${key}"`);
}

function value_to_state(value: string): Metadata {
  for (let x of TYPES) {
    if (x.value === value) {
      return {
        grade: x.grade,
        locked: x.locked,
        solution: x.solution,
        points: x.points
      };
    }
  }
  throw Error(`unknown value "${value}"`);
}

const OPTIONS_CODE: Rendered[] = [];
const OPTIONS_NOTCODE: Rendered[] = [];

for (let x of TYPES) {
  const option = (
    <option key={x.value} value={x.value}>
      {x.title}
    </option>
  );
  OPTIONS_CODE.push(option);
  if (!x.code_only) {
    OPTIONS_NOTCODE.push(option);
  }
}

interface CreateAssignmentProps {
  actions: JupyterActions;
  cell: Map<string, any>;
}

export class CreateAssignmentToolbar extends Component<CreateAssignmentProps> {
  private select(value: string): void {
    if (value == "") {
      // clearing state
      this.props.actions.nbgrader_actions.set_metadata(
        this.props.cell.get("id")
      );
      return;
    }
    const metadata: Metadata = value_to_state(value);
    if (value == "readonly") {
      metadata.grade_id = undefined;
    } else {
      metadata.grade_id = this.props.cell.getIn(
        ["metadata", "nbgrader", "grade_id"],
        this.props.cell.get("id")
      ); // TODO -- check if default is globally unique...?
    }
    this.props.actions.nbgrader_actions.set_metadata(
      this.props.cell.get("id"),
      metadata
    );
  }

  private set_points(points: number): void {
    if (points < 0) {
      points = 0;
    }
    this.props.actions.nbgrader_actions.set_metadata(
      this.props.cell.get("id"),
      { points }
    );
  }

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

  private render_locked(): Rendered {
    const locked: boolean = !!this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "locked"
    ]);
    if (!locked) return;
    return <Icon name={"lock"} style={{ float: "left", padding: "5px" }} />;
  }

  private render_points(): Rendered {
    const points: number | undefined = this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "points"
    ]);
    if (points == null) return;
    return (
      <FormGroup>
        <ControlLabel style={{ color: "white", fontWeight: 400 }}>
          Points:
        </ControlLabel>
        <FormControl
          type="number"
          value={points}
          onChange={e => this.set_points((e.target as any).value)}
          style={{ width: "5em", marginLeft: "5px" }}
        />
      </FormGroup>
    );
  }

  private set_grade_id(grade_id: string): void {
    // TODO: check globally unique... or change to always just equal the cell id...
    this.props.actions.nbgrader_actions.set_metadata(
      this.props.cell.get("id"),
      { grade_id }
    );
  }

  private render_id(): Rendered {
    const grade_id: number | undefined = this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "grade_id"
    ]);
    if (grade_id == null) return;
    return (
      <FormGroup>
        <ControlLabel
          style={{ marginLeft: "15px", color: "white", fontWeight: 400 }}
        >
          ID:
        </ControlLabel>
        <input
          spellCheck={false}
          type="input"
          value={grade_id}
          onChange={e => this.set_grade_id((e.target as any).value)}
          style={{ width: "5em", marginLeft: "10px" }}
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
      <span style={{ marginLeft: "15px" }}>
        <FormControl
          componentClass="select"
          placeholder="select"
          onChange={e => this.select((e as any).target.value)}
          value={this.get_value()}
          style={{ marginLeft: "15px" }}
        >
          {options}
        </FormControl>
      </span>
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
        {this.render_locked()}
        <Form inline style={{ float: "right" }}>
          {this.render_points()}
          {this.render_id()}
          {this.render_dropdown()}
        </Form>
      </div>
    );
  }
}
