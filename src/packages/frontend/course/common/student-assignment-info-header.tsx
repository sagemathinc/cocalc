/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row } from "antd";
import { useIntl } from "react-intl";
import type { ReactNode } from "react";

import { Tip } from "@cocalc/frontend/components";
import { capitalize, unreachable } from "@cocalc/util/misc";
import { AssignmentCopyStep } from "../types";
import { course } from "@cocalc/frontend/i18n";

interface StudentAssignmentInfoHeaderProps {
  title: "Assignment" | "Handout" | "Student";
  peer_grade?: boolean;
  mode?: "assignment" | "student";
  actions?: Partial<Record<AssignmentCopyStep | "grade", ReactNode | ReactNode[]>>;
  filter?: ReactNode;
  progress?: Partial<Record<AssignmentCopyStep | "grade", ReactNode>>;
}

export function StudentAssignmentInfoHeader({
  title,
  peer_grade,
  mode = "student",
  actions,
  filter,
  progress,
}: StudentAssignmentInfoHeaderProps) {
  const intl = useIntl();

  function tip_title(key: AssignmentCopyStep | "grade"): {
    tip: string;
    title: string;
  } {
    switch (key) {
      case "assignment":
        return {
          title: intl.formatMessage({
            id: "course.student-assignment-info-header.assign.label",
            defaultMessage: "Assign",
            description: "Student in an online course",
          }),
          tip: intl.formatMessage({
            id: "course.student-assignment-info-header.assign.tooltip",
            defaultMessage:
              "This column gives the status of making homework available to students, and lets you copy homework to one student at a time.",
            description: "Student in an online course",
          }),
        };
      case "collect":
        return {
          title: intl.formatMessage({
            id: "course.student-assignment-info-header.collect.label",
            defaultMessage: "Collect",
            description: "Student in an online course",
          }),
          tip: intl.formatMessage({
            id: "course.student-assignment-info-header.collect.tooltip",
            defaultMessage:
              "This column gives status information about collecting homework from students, and lets you collect from one student at a time.",
            description: "Student in an online course",
          }),
        };
      case "grade":
        return {
          title: intl.formatMessage({
            id: "course.student-assignment-info-header.grade.label",
            defaultMessage: "Grade",
            description: "For a student in an online course",
          }),
          tip: intl.formatMessage({
            id: "course.student-assignment-info-header.grade.tooltip",
            defaultMessage:
              "Use this column to record the grade the student received on the assignment. Once the grade is recorded, you can return the assignment.  You can also export grades to a file in the Configuration tab.  Enter anything here; it does not have to be a number.",
            description: "For a student in an online course",
          }),
        };
      case "peer_assignment":
        return {
          title: intl.formatMessage({
            id: "course.student-assignment-info-header.peer_assignment.label",
            defaultMessage: "Peer Assign",
            description: "For a group of students in an online course",
          }),
          tip: intl.formatMessage({
            id: "course.student-assignment-info-header.peer_assignment.tooltip",
            defaultMessage:
              "This column gives the status of sending out collected homework to students for peer grading.",
            description: "For a group of students in an online course",
          }),
        };

      case "peer_collect":
        return {
          title: intl.formatMessage({
            id: "course.student-assignment-info-header.peer_collect.label",
            defaultMessage: "Peer Collect",
            description: "For a group of students in an online course",
          }),
          tip: intl.formatMessage({
            id: "course.student-assignment-info-header.peer_collect.tooltip",
            defaultMessage:
              "This column gives status information about collecting the peer grading work that students did, and lets you collect peer grading from one student at a time.",
            description: "For a group of students in an online course",
          }),
        };

      case "return_graded":
        return {
          title: intl.formatMessage({
            id: "course.student-assignment-info-header.return.label",
            defaultMessage: "Return",
            description: "For a student in an online course",
          }),
          tip: intl.formatMessage({
            id: "course.student-assignment-info-header.return.tooltip",
            defaultMessage: "Return to Student",
            description:
              "This column gives status information about when you returned homework to the students.  Once you have entered a grade, you can return the assignment.",
          }),
        };
      default:
        unreachable(key);
    }
    throw new Error(`unknown key: ${key}`);
  }

  function render_col(key: AssignmentCopyStep | "grade", width: 4 | 6) {
    const { tip, title } = tip_title(key);
    const actionNodes =
      mode === "assignment" && actions != null ? actions[key] : undefined;
    const renderedActions =
      actionNodes == null
        ? null
        : Array.isArray(actionNodes)
          ? actionNodes
          : [actionNodes];
    const progressNode =
      mode === "assignment" && progress != null ? progress[key] : undefined;

    return (
      <Col md={width} key={key}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Tip title={title} tip={tip}>
              <b>{title}</b>
            </Tip>
            {renderedActions ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {renderedActions}
              </div>
            ) : null}
          </div>
          {progressNode}
        </div>
      </Col>
    );
  }

  function render_headers() {
    const w = 6;
    return (
      <Row>
        {render_col("assignment", w)}
        {render_col("collect", w)}
        {render_col("grade", w)}
        {render_col("return_graded", w)}
      </Row>
    );
  }

  function render_headers_peer() {
    const w = 4;
    return (
      <Row>
        {render_col("assignment", w)}
        {render_col("collect", w)}
        {render_col("peer_assignment", w)}
        {render_col("peer_collect", w)}
        {render_col("grade", w)}
        {render_col("return_graded", w)}
      </Row>
    );
  }

  const tooltip = intl.formatMessage(
    {
      id: "course.student-assignment-info-header.row.tooltip",
      defaultMessage: `{key, select,
      Assignment {This column gives the directory name of the assignment.}
      other {This column gives the name of the student.}}`,
      description: "student in an online course",
    },
    { key: title },
  );

  function titleIntl(): string {
    switch (title) {
      case "Assignment":
        return intl.formatMessage(course.assignment);
      case "Handout":
        return intl.formatMessage(course.handout);
        case "Student":
        return intl.formatMessage(course.student);
      default:
        return title;
    }
  }

  return (
    <div>
      <Row>
        <Col md={4} key="title" style={{ paddingRight: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <Tip title={title} tip={tooltip}>
              <b>{capitalize(titleIntl())}</b>
            </Tip>
            {filter}
          </div>
        </Col>
        <Col md={20} key="rest">
          {peer_grade ? render_headers_peer() : render_headers()}
        </Col>
      </Row>
    </div>
  );
}
