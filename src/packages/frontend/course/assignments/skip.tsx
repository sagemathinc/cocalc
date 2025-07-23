/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Skip assigning or collecting an assignment, so next step can be attempted.
*/

import { CourseActions } from "../actions";
import { AssignmentRecord } from "../store";
import { Icon, Gap, Tip } from "../../components";
import { Button } from "antd";

interface SkipCopyProps {
  assignment: AssignmentRecord;
  step: string;
  actions: CourseActions;
}

export function SkipCopy({ assignment, step, actions }: SkipCopyProps) {
  function click() {
    actions.assignments.set_skip(
      assignment.get("assignment_id"),
      step,
      !assignment.get(`skip_${step}` as any),
    );
  }

  function icon_extra() {
    let icon;
    let extra: React.JSX.Element | undefined = undefined;
    if (assignment.get(`skip_${step}` as any)) {
      icon = "check-square-o";
      if (assignment.getIn(["peer_grade", "enabled"])) {
        // don't bother even trying to implement skip and peer grading at once.
        extra = (
          <span>
            <Gap /> (Please disable this or peer grading.)
          </span>
        );
      }
    } else {
      icon = "square-o";
    }
    return { icon, extra };
  }

  const { icon, extra } = icon_extra();

  return (
    <Tip
      placement="left"
      title="Skip step in workflow"
      tip="Click this checkbox to enable doing the next step after this step, e.g., you can try to collect assignments that you never explicitly assigned (maybe the students put them in place some other way)."
    >
      <Button onClick={click}>
        <Icon name={icon} /> Skip {step} {extra}
      </Button>
    </Tip>
  );
}
