/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { Tip } from "@cocalc/frontend/components";
import { Col, Row } from "antd";
import { AssignmentCopyStep } from "../types";

interface StudentAssignmentInfoHeaderProps {
  title: string;
  peer_grade?: boolean;
}

export class StudentAssignmentInfoHeader extends Component<StudentAssignmentInfoHeaderProps> {
  private render_col(
    number: number,
    key: AssignmentCopyStep | "grade",
    width: 4 | 6
  ): Rendered {
    let tip: string, title: string;
    switch (key) {
      case "assignment":
        title = "Assign to Student";
        tip =
          "This column gives the status of making homework available to students, and lets you copy homework to one student at a time.";
        break;
      case "collect":
        title = "Collect from Student";
        tip =
          "This column gives status information about collecting homework from students, and lets you collect from one student at a time.";
        break;
      case "grade":
        title = "Record homework grade.";
        tip =
          "Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Configuration tab.  Enter anything here; it does not have to be a number.";
        break;

      case "peer_assignment":
        title = "Assign Peer Grading";
        tip =
          "This column gives the status of sending out collected homework to students for peer grading.";
        break;

      case "peer_collect":
        title = "Collect Peer Grading";
        tip =
          "This column gives status information about collecting the peer grading work that students did, and lets you collect peer grading from one student at a time.";
        break;

      case "return_graded":
        title = "Return to Student";
        tip =
          "This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.";
        break;
    }
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

  private render_headers(): Rendered {
    const w = 6;
    return (
      <Row>
        {this.render_col(1, "assignment", w)}
        {this.render_col(2, "collect", w)}
        {this.render_col(3, "grade", w)}
        {this.render_col(4, "return_graded", w)}
      </Row>
    );
  }

  private render_headers_peer(): Rendered {
    const w = 4;
    return (
      <Row>
        {this.render_col(1, "assignment", w)}
        {this.render_col(2, "collect", w)}
        {this.render_col(3, "peer_assignment", w)}
        {this.render_col(4, "peer_collect", w)}
        {this.render_col(5, "grade", w)}
        {this.render_col(6, "return_graded", w)}
      </Row>
    );
  }

  public render(): Rendered {
    return (
      <div>
        <Row style={{ borderBottom: "2px solid #aaa" }}>
          <Col md={4} key="title">
            <Tip
              title={this.props.title}
              tip={
                this.props.title === "Assignment"
                  ? "This column gives the directory name of the assignment."
                  : "This column gives the name of the student."
              }
            >
              <b>{this.props.title}</b>
            </Tip>
          </Col>
          <Col md={20} key="rest">
            {this.props.peer_grade
              ? this.render_headers_peer()
              : this.render_headers()}
          </Col>
        </Row>
      </div>
    );
  }
}
