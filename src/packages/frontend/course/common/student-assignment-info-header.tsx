/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered } from "@cocalc/frontend/app-framework";
import { Tip } from "@cocalc/frontend/components";
import { unreachable } from "@cocalc/util/misc";
import { Col, Row } from "antd";
import { AssignmentCopyStep } from "../types";

interface StudentAssignmentInfoHeaderProps {
  title: string;
  peer_grade?: boolean;
}

export const StudentAssignmentInfoHeader: React.FC<StudentAssignmentInfoHeaderProps> =
  React.memo((props: StudentAssignmentInfoHeaderProps) => {
    const { title, peer_grade } = props;

    function tip_title(key: AssignmentCopyStep | "grade"): {
      tip: string;
      title: string;
    } {
      switch (key) {
        case "assignment":
          return {
            title: "Assign to Student",
            tip: "This column gives the status of making homework available to students, and lets you copy homework to one student at a time.",
          };
        case "collect":
          return {
            title: "Collect from Student",
            tip: "This column gives status information about collecting homework from students, and lets you collect from one student at a time.",
          };
        case "grade":
          return {
            title: "Record homework grade.",
            tip: "Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Configuration tab.  Enter anything here; it does not have to be a number.",
          };
        case "peer_assignment":
          return {
            title: "Assign Peer Grading",
            tip: "This column gives the status of sending out collected homework to students for peer grading.",
          };

        case "peer_collect":
          return {
            title: "Collect Peer Grading",
            tip: "This column gives status information about collecting the peer grading work that students did, and lets you collect peer grading from one student at a time.",
          };

        case "return_graded":
          return {
            title: "Return to Student",
            tip: "This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.",
          };
        default:
          unreachable(key);
      }
      throw new Error(`unknown key: ${key}`);
    }

    function render_col(
      number: number,
      key: AssignmentCopyStep | "grade",
      width: 4 | 6
    ): Rendered {
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

    function render_headers(): Rendered {
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

    function render_headers_peer(): Rendered {
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
  });
