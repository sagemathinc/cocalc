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
  Form
} from "react-bootstrap";
import { Map } from "immutable";

import { React, Component, Rendered } from "../../app-framework";

import { Icon } from "../../r_misc/icon";

import { JupyterActions } from "../browser-actions";

import { Metadata } from "./types";

import { popup } from "../../frame-editors/frame-tree/print";

interface CelltypeInfo {
  title: string; // human readable title for this type of cell
  value: string; // what type of cell it is
  grade: boolean; // is it graded?
  locked: boolean; // is it locked?
  solution: boolean; // is it a solution?
  link: string; // link to some html help (the nbgrader docs)
  hover: string; // hover text that is helpful about this cell type (summary of nbgrader docs)
  points?: number; // default number of points
  icon?: string; // icon that would make sense for this type of cell
  code_only?: boolean; // only code cells can be set to this type
}

const CELLTYPE_INFO_LIST: CelltypeInfo[] = [
  {
    title: "-",
    value: "",
    grade: false,
    locked: false,
    solution: false,
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#developing-assignments-with-the-assignment-toolbar",
    hover:
      "Instructors develop assignments using the assignment toolbar, which allows them to specify the type of problem in each cell and how it will be graded."
  },
  {
    title: "Manually graded answer",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#manually-graded-answer-cells",
    hover:
      "Cell contains an answer that must be manually graded by a human grader.",
    value: "manual",
    icon: "book-reader",
    grade: true,
    locked: false,
    solution: true,
    points: 0
  },
  {
    title: "Autograded answer",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#autograded-answer-cells",
    hover: "Cell contains an answer that will be autograded.",
    value: "auto",
    icon: "magic",
    grade: false,
    locked: false,
    solution: true,
    code_only: true
  },
  {
    title: "Autograder tests",
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#autograder-tests-cells",
    hover: "Cell that contains tests to be run during autograding.",
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
    link:
      "https://nbgrader.readthedocs.io/en/stable/user_guide/creating_and_grading_assignments.html#read-only-cells",
    hover:
      "Cell is marked as one that cannot be modified; during autograding the original version is recovered in case it was changed by the student.",
    value: "readonly",
    icon: "lock",
    grade: false,
    locked: true,
    solution: false
  }
];

const CELLTYPE_INFO_MAP: { [value: string]: CelltypeInfo } = {};
for (let x of CELLTYPE_INFO_LIST) {
  CELLTYPE_INFO_MAP[x.value] = x;
}

// I could implement this with another map hardcoded
// in Javascript, but instead use a function with a cache
// since it's more flexible.
const value_cache: { [key: string]: string } = {};
function state_to_value(state: Metadata): string {
  const grade: boolean = !!state.grade;
  const locked: boolean = !!state.locked;
  const solution: boolean = !!state.solution;
  if (grade === false && locked === false && solution === false) {
    return "";
  }
  const key = JSON.stringify({ grade, solution });
  if (value_cache[key] != undefined) return value_cache[key];
  for (let x of CELLTYPE_INFO_LIST) {
    if (x.grade == grade && x.solution == solution) {
      value_cache[key] = x.value;
      return x.value;
    }
  }
  throw Error(`invalid state - "${key}"`);
}

function value_to_state(value: string): Metadata {
  const x = CELLTYPE_INFO_MAP[value];
  if (x == null) {
    throw Error(`unknown value "${value}"`);
  }
  return {
    grade: x.grade,
    locked: x.locked,
    solution: x.solution,
    points: x.points
  };
}

const OPTIONS_CODE: Rendered[] = [];
const OPTIONS_NOTCODE: Rendered[] = [];

for (let x of CELLTYPE_INFO_LIST) {
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
        <ControlLabel style={{ fontWeight: 400 }}>Points:</ControlLabel>
        <FormControl
          type="number"
          value={points}
          onChange={e => this.set_points(parseInt((e.target as any).value))}
          style={{
            color: "#666",
            width: "64px",
            marginLeft: "5px",
            fontSize: "14px"
          }}
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
    const grade_id: string | undefined = this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "grade_id"
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
          onChange={e => this.set_grade_id((e.target as any).value)}
          style={{
            width: `${grade_id.length <= 6 ? 64 : 180}px`,
            marginLeft: "10px",
            paddingLeft: "5px",
            color: "#666",
            fontSize: "14px"
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
        onChange={e => this.select((e as any).target.value)}
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
    if (info == null) return;
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
        {this.render_locked()}
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
