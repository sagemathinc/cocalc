/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tip } from "@cocalc/frontend/components";
import { unreachable } from "@cocalc/util/misc";
import { Col, Row } from "antd";
import { AssignmentCopyStep } from "../types";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface StudentAssignmentInfoHeaderProps {
  title: string;
  peer_grade?: boolean;
}

export function StudentAssignmentInfoHeader({
  title,
  peer_grade,
}: StudentAssignmentInfoHeaderProps) {
  const { actions } = useFrameContext();
  function tip_title(key: AssignmentCopyStep | "grade") {
    switch (key) {
      case "assignment":
        return {
          title: "Assign to Student",
          tip: "Status of making assignment available to students; also, you can copy assignment to one student at a time.",
        };
      case "collect":
        return {
          title: "Collect from Student",
          tip: "Status information about collecting assignments from students; also, you can collect from one student at a time.",
        };
      case "grade":
        return {
          title: "Record Assignment Grade",
          tip: (
            <>
              Record the grade the student received on the assignment. Once the
              grade is recorded, you can return the assignment. You can also{" "}
              <a onClick={() => (actions as any)?.setModal?.("export-grades")}>
                export grades to a file in the Actions tab
              </a>
              . Enter anything here; it does not have to be a number.
            </>
          ),
        };
      case "peer_assignment":
        return {
          title: "Assign Peer Grading",
          tip: "Status of sending out collected assignment to students for peer grading.",
        };

      case "peer_collect":
        return {
          title: "Collect Peer Grading",
          tip: "Status information about collecting the peer grading work that students did; also, you can collect peer grading from one student at a time.",
        };

      case "return_graded":
        return {
          title: "Return to Student",
          tip: "Status information about when you returned assignment to the students.  Once you have entered a grade, you can return the assignment.",
        };
      default:
        unreachable(key);
    }
    throw new Error(`unknown key: ${key}`);
  }

  function render_col(
    number: number,
    key: AssignmentCopyStep | "grade",
    width: 4 | 6,
  ) {
    const { tip, title } = tip_title(key);

    return (
      <Col md={width} key={key}>
        <Tip title={title} tip={tip}>
          <b>
            {number}. {title}
          </b>
        </Tip>
      </Col>
    );
  }

  function render_headers() {
    const w = 6;
    return (
      <Row>
        {render_col(1, "assignment", w)}
        {render_col(2, "collect", w)}
        {render_col(3, "grade", w)}
        {render_col(4, "return_graded", w)}
      </Row>
    );
  }

  function render_headers_peer() {
    const w = 4;
    return (
      <Row>
        {render_col(1, "assignment", w)}
        {render_col(2, "collect", w)}
        {render_col(3, "peer_assignment", w)}
        {render_col(4, "peer_collect", w)}
        {render_col(5, "grade", w)}
        {render_col(6, "return_graded", w)}
      </Row>
    );
  }

  return (
    <div>
      <Row style={{ borderBottom: "2px solid #aaa" }}>
        <Col md={4} key="title">
          <Tip
            title={title}
            tip={
              title === "Assignment"
                ? "This column gives the directory name of the assignment."
                : "This column gives the name of the student."
            }
          >
            <b>{title}</b>
          </Tip>
        </Col>
        <Col md={20} key="rest">
          {peer_grade ? render_headers_peer() : render_headers()}
        </Col>
      </Row>
    </div>
  );
}
