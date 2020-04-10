import {
  React,
  Component,
  Rendered,
  rtypes,
  redux,
  rclass,
} from "../../app-framework";

import { Card } from "antd";

import { Checkbox } from "../../antd-bootstrap";

import { Icon } from "../../r_misc";

import { CourseActions } from "../actions";

interface Props {
  name: string;

  // redux Props
  settings?: any;
}

class Nbgrader extends Component<Props> {
  static reduxProps({ name }) {
    return {
      [name]: { settings: rtypes.immutable.Map },
    };
  }

  private onChange(checked: boolean): void {
    const actions: CourseActions = redux.getActions(this.props.name);
    actions?.configuration.set_nbgrader_grade_in_instructor_project(checked);
  }

  render(): Rendered {
    return (
      <Card
        title={
          <>
            <Icon name="graduation-cap" /> Nbgrader
          </>
        }
      >
        <div
          style={{
            border: "1px solid lightgrey",
            padding: "10px",
            borderRadius: "5px",
          }}
        >
          <Checkbox
            checked={this.props.settings?.get(
              "nbgrader_grade_in_instructor_project"
            )}
            onChange={(e) => this.onChange((e.target as any).checked)}
          >
            Grade in instructor project: run autograding in the instructor's
            project instead of the student's projects; less secure, but it
            doesn't require starting the student projects, and the instructor
            project may have much more memory.
          </Checkbox>
        </div>
      </Card>
    );
  }
}

const tmp = rclass(Nbgrader);
export { tmp as Nbgrader };
