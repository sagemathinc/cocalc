/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Popover, Row, Space, Typography } from "antd";
import { useIntl } from "react-intl";
import type { ReactNode } from "react";

import { Icon, Tip } from "@cocalc/frontend/components";
import { capitalize, unreachable } from "@cocalc/util/misc";
import { AssignmentCopyStep } from "../types";
import { course, labels } from "@cocalc/frontend/i18n";
import { GRADE_FLEX } from "./consts";
import { step_direction, step_verb } from "../util";

interface StudentAssignmentInfoHeaderProps {
  title: "Assignment" | "Handout" | "Student";
  peer_grade?: boolean;
  mode?: "assignment" | "student";
  actions?: Partial<
    Record<AssignmentCopyStep | "grade", ReactNode | ReactNode[]>
  >;
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
  const { Text } = Typography;
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
              "Make an independent copy of all assignment files in each student's project",
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
              "Copy current assignment files in the student's project to your project. Students still can edit their versions, but later changes will not be reflected in your copy, unless you collect again.",
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
              "Record student's grade for this assignment. It does not have to be a number.",
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
              "Distribute collected assignments for peer grading: each submission is copied to N randomly chosen classmates (set in Peer Grading). You must assign and collect from all students before you can peer-assign.",
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
              "Collect peer-graded submissions: copy assignments with peer feedback from student projects to your project. You must peer-assign to all students before you can peer-collect.",
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
            defaultMessage:
              "Copy grades, comments, and assignment files with feedback from your project to students",
            description: "For a student in an online course",
          }),
        };
      default:
        unreachable(key);
    }
    throw new Error(`unknown key: ${key}`);
  }

  function render_info_content(
    key: AssignmentCopyStep | "grade",
    title: string,
    tip: string,
  ) {
    if (key === "grade") { // This step is quite different from others
      return (
        <Space direction="vertical" size="small" style={{ maxWidth: 360 }}>
          <Text strong>Grade: Scores & Comments</Text>
          <div>{tip}</div>
          <Text strong>Actions</Text>
          <div>
            <Icon name="forward" /> Run{" "}
            <a
              href="https://doc.cocalc.com/teaching-nbgrader.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              automated grading
            </a>{" "}
            for all students (if available)
          </div>
          {mode === "assignment" ? (
            <div>
              <Icon name="toggle-on" /> Allow proceeding without grading
            </div>
          ) : null}
          <div>
            <Icon name="pencil" /> Edit grade and comments for this student
          </div>
        </Space>
      );
    }

    const direction = step_direction(key);
    const verb = capitalize(step_verb(key));
    const you = intl.formatMessage(labels.you);
    const students = intl.formatMessage(course.students);
    const decoratedTitle =
      direction === "to" ? (
        <span>
          {title}: <Icon name="user-secret" /> {you} <Icon name="arrow-right" />{" "}
          <Icon name="users" /> {students}
        </span>
      ) : (
        <span>
          {title}: <Icon name="users" /> {students} <Icon name="arrow-right" />{" "}
          <Icon name="user-secret" /> {you}
        </span>
      );
    const openInfo = (() => {
      switch (key) {
        case "assignment":
          return "Open the student's copy in student's project";
        case "collect":
          return "Open this student's collected work in your project";
        case "peer_assignment":
          return "Open the student's peer-grading copy in their project";
        case "peer_collect":
          return "Open this student's collected peer-grading in your project";
        case "return_graded":
          return "Open the returned copy in the student's project";
      }
    })();

    return (
      <Space direction="vertical" size="small" style={{ maxWidth: 380 }}>
        <Text strong>{decoratedTitle}</Text>
        <div>{tip}</div>
        <Text strong>Actions</Text>
        {mode === "assignment" ? (
          <div>
            <Icon name="forward" /> {verb} {direction} all students
          </div>
        ) : null}
        {mode === "assignment" &&
        (peer_grade
          ? key === "grade"
          : key === "assignment" || key === "collect" || key === "grade") ? (
          <div>
            <Icon name="toggle-on" /> Allow proceeding without {step_verb(key)}
            ing
          </div>
        ) : null}
        <div>
          <Icon name="caret-right" /> {verb} {direction} this student
        </div>
        <div>
          <Icon name="redo" /> {verb} again {direction} this student
        </div>
        <div>
          <Icon name="folder-open" /> {openInfo}
        </div>
      </Space>
    );
  }

  function render_col(key: AssignmentCopyStep | "grade", flex: string) {
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
      <Col flex={flex} key={key}>
        <Space direction="vertical">
          <Space wrap>
            <Space.Compact>
              <Popover
                trigger="click"
                placement="top"
                content={render_info_content(key, title, tip)}
              >
                <Button
                  type="link"
                  size="small"
                  icon={<Icon name="info-circle" />}
                />
              </Popover>
              <Text strong>{title}</Text>
            </Space.Compact>
            <Space>{renderedActions}</Space>
          </Space>
          {progressNode}
        </Space>
      </Col>
    );
  }

  function render_headers() {
    return (
      <Row>
        {render_col("assignment", "1")}
        {render_col("collect", "1")}
        {render_col("grade", GRADE_FLEX)}
        {render_col("return_graded", "1")}
      </Row>
    );
  }

  function render_headers_peer() {
    return (
      <Row>
        {render_col("assignment", "1")}
        {render_col("collect", "1")}
        {render_col("peer_assignment", "1")}
        {render_col("peer_collect", "1")}
        {render_col("grade", GRADE_FLEX)}
        {render_col("return_graded", "1")}
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
              <Text strong>{capitalize(titleIntl())}</Text>
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
