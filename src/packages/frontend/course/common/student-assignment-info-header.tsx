/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Popover, Row, Space, Typography } from "antd";
import { useIntl } from "react-intl";
import type { ReactNode } from "react";

import { Icon, Tip } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";
import { AssignmentStep } from "../types";
import { course } from "@cocalc/frontend/i18n";
import { GRADE_FLEX } from "./consts";
import {
  columnInfoAria,
  columnLabel,
  gradeMsg,
  copyStepMsg,
} from "./course-step-messages";

interface StudentAssignmentInfoHeaderProps {
  mode: "assignment" | "handout" | "student";
  peer_grade?: boolean;
  actions?: Partial<Record<AssignmentStep, ReactNode | ReactNode[]>>;
  progress?: Partial<Record<AssignmentStep, ReactNode>>;
  filter?: ReactNode;
}

export function StudentAssignmentInfoHeader({
  mode,
  peer_grade,
  actions,
  progress,
  filter,
}: StudentAssignmentInfoHeaderProps) {
  const { Text } = Typography;
  const intl = useIntl();
  const rowTitle = capitalize(
    mode === "student"
      ? intl.formatMessage(course.assignment)
      : intl.formatMessage(course.student),
  );

  function render_info_content(key: AssignmentStep) {
    if (key === "grade") {
      // This step is quite different from others
      const msg = gradeMsg(intl);
      return (
        <Space direction="vertical" size="small" style={{ maxWidth: 360 }}>
          <Text strong>{msg.title}</Text>
          <div>{msg.tip}</div>
          <Text strong>{msg.actions}</Text>
          <div>
            <Icon name="forward" /> {msg.runnbgrader}
          </div>
          {mode === "assignment" ? (
            <div>
              <Icon name="toggle-on" /> {msg.skipInfo}
            </div>
          ) : null}
          <div>
            <Icon name="pencil" /> {msg.editOne}
          </div>
        </Space>
      );
    }

    const msg = copyStepMsg(intl, key);

    return (
      <Space direction="vertical" size="small" style={{ maxWidth: 380 }}>
        <Text strong>{msg.title}</Text>
        <div>{msg.tip}</div>
        <Text strong>{msg.actions}</Text>
        {mode !== "student" ? (
          <div>
            <Icon name="forward" /> {msg.runAll}
          </div>
        ) : null}
        {mode !== "student" &&
        !peer_grade &&
        (key === "assignment" || key === "collect") ? (
          <div>
            <Icon name="toggle-on" /> {msg.skipInfo}
          </div>
        ) : null}
        <div>
          <Icon name="caret-right" /> {msg.runOne}
        </div>
        <div>
          <Icon name="redo" /> {msg.redoOne}
        </div>
        <div>
          <Icon name="folder-open" /> {msg.openOne}
        </div>
      </Space>
    );
  }

  function render_col(key: AssignmentStep, flex: string) {
    const title = columnLabel(intl, key);
    const actionNodes =
      mode !== "student" && actions != null ? actions[key] : undefined;
    const renderedActions =
      actionNodes == null
        ? null
        : Array.isArray(actionNodes)
          ? actionNodes
          : [actionNodes];
    const progressNode =
      mode !== "student" && progress != null ? progress[key] : undefined;
    return (
      <Col flex={flex} key={key}>
        <Space direction="vertical">
          <Space wrap>
            <Space.Compact>
              <Popover
                trigger="click"
                placement="top"
                content={render_info_content(key)}
              >
                <Button
                  type="link"
                  size="small"
                  icon={<Icon name="info-circle" />}
                  aria-label={columnInfoAria(intl, title)}
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
    const stepsToRender: AssignmentStep[] =
      mode === "handout"
        ? ["distribution"]
        : peer_grade
          ? [
              "assignment",
              "collect",
              "peer_assignment",
              "peer_collect",
              "grade",
              "return_graded",
            ]
          : ["assignment", "collect", "grade", "return_graded"];
    return (
      <Row>
        {stepsToRender.map((key) =>
          render_col(key, key === "grade" ? GRADE_FLEX : "1"),
        )}
      </Row>
    );
  }

  const tooltip = intl.formatMessage(
    {
      id: "course.student-assignment-info-header.row.tooltip",
      defaultMessage: `{mode, select,
      student {This column gives the directory name of the assignment.}
      other {This column gives the name of the student.}}`,
      description:
        "Tooltip text for the first column header in course workflow tables",
    },
    { mode },
  );

  return (
    <div>
      <Row>
        <Col md={4} key="title" style={{ paddingRight: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <Tip title={rowTitle} tip={tooltip}>
              <Text strong>{rowTitle}</Text>
            </Tip>
            {filter}
          </div>
        </Col>
        <Col md={20} key="rest">
          {render_headers()}
        </Col>
      </Row>
    </div>
  );
}
