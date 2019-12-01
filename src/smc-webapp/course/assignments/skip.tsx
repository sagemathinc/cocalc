/*
Skip assigning or collecting an assignment, so next step can be attempted.
*/

import { React, Component, Rendered } from "../../app-framework";
import { CourseActions } from "../actions";
import { AssignmentRecord } from "../store";
import { Icon, Space, Tip } from "../../r_misc";
import { Button } from "react-bootstrap";

interface SkipCopyProps {
  assignment: AssignmentRecord;
  step: string;
  actions: CourseActions;
  not_done?: number;
}

export class SkipCopy extends Component<SkipCopyProps> {
  render_checkbox() {
    if (this.props.not_done === 0) {
      return (
        <span style={{ fontSize: "12pt" }}>
          <Icon name="check-circle" />
          <Space />
        </span>
      );
    }
  }

  click = () => {
    this.props.actions.assignments.set_skip(
      this.props.assignment.get("assignment_id"),
      this.props.step,
      !this.props.assignment.get(`skip_${this.props.step}` as any)
    );
  };

  render() {
    let icon: string;
    let extra: Rendered = undefined;
    if (this.props.assignment.get(`skip_${this.props.step}` as any)) {
      icon = "check-square-o";
      if (this.props.assignment.getIn(["peer_grade", "enabled"])) {
        // don't bother even trying to implement skip and peer grading at once.
        extra = (
          <span>
            <Space /> (Please disable this or peer grading.)
          </span>
        );
      }
    } else {
      icon = "square-o";
    }
    return (
      <Tip
        placement="left"
        title="Skip step in workflow"
        tip="Click this checkbox to enable doing the next step after this step, e.g., you can try to collect assignments that you never explicitly assigned (maybe the students put them in place some other way)."
      >
        <Button onClick={this.click}>
          <Icon name={icon} /> Skip {this.props.step} {extra}
        </Button>
      </Tip>
    );
  }
}
