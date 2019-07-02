/*
nbgrader functionality: the create assignment toolbar.
<Form inline>
  <FormGroup controlId="formInlineName">
*/

import { Button, FormControl, Form } from "react-bootstrap";
import { Map as ImmutableMap } from "immutable";

import { Space } from "../../r_misc/space";
import { React, Component } from "../../app-framework";

import { JupyterActions } from "../browser-actions";

// icon is ignored, since option child has to be text for now, evidently... :-(
const TYPES = [
  { title: "-", value: "" },
  { title: "Manually graded answer", value: "manual", icon: "book-reader" },
  { title: "Autograded answer", value: "auto", icon: "magic" },
  { title: "Autograder tests", value: "test", icon: "check" },
  { title: "Readonly", value: "readonly", icon: "lock" }
];

const rendered_options = TYPES.map(x => (
  <option key={x.value} value={x.value}>
    {x.title}
  </option>
));

interface CreateAssignmentProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export class CreateAssignmentToolbar extends Component<CreateAssignmentProps> {
  private select(value: string): void {
    this.props.actions.nbgrader_actions.create_assignment_toolbar(
      this.props.cell.get("id"),
      value
    );
  }

  render() {
    return (
      <Form inline>
        <FormControl
          componentClass="select"
          placeholder="select"
          onChange={e => this.select((e as any).target.value)}
          value={this.props.cell.get("slide", "")}
        >
          {rendered_options}
        </FormControl>
        <Space />
        <Button style={{ color: "#666" }}>id</Button>
      </Form>
    );
  }
}
