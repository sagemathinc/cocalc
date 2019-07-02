/*
nbgrader functionality: the create assignment toolbar.
<Form inline>
  <FormGroup controlId="formInlineName">
*/

import { FormControl, Form } from "react-bootstrap";
import { Map } from "immutable";

import { Space } from "../../r_misc/space";
import { React, Component, Rendered } from "../../app-framework";

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
    solution: true
  },
  {
    title: "Autograder tests",
    value: "test",
    icon: "check",
    grade: true,
    locked: true,
    solution: false,
    points: 0
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
  console.warn("invalid state", state);
  return ""; // don't crash notebook if state is invalid
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

const rendered_options = TYPES.map(x => (
  <option key={x.value} value={x.value}>
    {x.title}
  </option>
));

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
      this.props.cell.get("id")
    ); // TODO -- check if default is globally unique...?
    this.props.actions.nbgrader_actions.set_metadata(
      this.props.cell.get("id"),
      metadata
    );
  }

  private get_value(): string {
    const x = this.props.cell.getIn(["metadata", "nbgrader"], Map());
    if (x == null) return "";
    return state_to_value(x.toJS());
  }

  private render_points(): Rendered {
    const points: number | undefined = this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "points"
    ]);
    if (points != null) {
      return <span>{points}</span>;
    }
  }

  private render_id(): Rendered {
    const id: number | undefined = this.props.cell.getIn([
      "metadata",
      "nbgrader",
      "grade_id"
    ]);
    if (id != null) {
      return <span>{id}</span>;
    }
  }

  private render_dropdown(): Rendered {
    return (
      <FormControl
        componentClass="select"
        placeholder="select"
        onChange={e => this.select((e as any).target.value)}
        value={this.get_value()}
      >
        {rendered_options}
      </FormControl>
    );
  }

  render() {
    return (
      <Form inline>
        {this.render_points()}
        <Space />
        {this.render_id()}
        <Space />
        {this.render_dropdown()}
      </Form>
    );
  }
}
