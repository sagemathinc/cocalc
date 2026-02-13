/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row, Space, Typography } from "antd";
import { AppRedux, useActions } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { trunc_middle } from "@cocalc/util/misc";

import { CourseActions } from "../actions";
import { BigTime, CourseUnitCard } from "../common";
import type { UserMap } from "../../todo-types";
import type {
  AssignmentRecord,
  IsGradingMap,
  NBgraderRunInfo,
  StudentsMap,
} from "../store";
import * as styles from "../styles";

interface AssignmentProps {
  active_feedback_edits: IsGradingMap;
  assignment: AssignmentRecord;
  background?: string;
  expand_peer_config?: boolean;
  frame_id?: string;
  is_expanded?: boolean;
  name: string;
  nbgrader_run_info?: NBgraderRunInfo;
  project_id: string;
  redux: AppRedux;
  students: StudentsMap;
  user_map: UserMap;
}

export function Assignment({
  active_feedback_edits,
  assignment,
  background,
  expand_peer_config,
  frame_id,
  is_expanded,
  name,
  nbgrader_run_info,
  project_id,
  redux,
  students,
  user_map,
}: AssignmentProps) {
  const actions = useActions<CourseActions>({ name });
  const dueDate = assignment.get("due_date");
  const assignmentName = (
    <>
      {trunc_middle(assignment.get("path"), 80)}
      {assignment.get("deleted") ? <b> (deleted)</b> : undefined}
    </>
  );

  return (
    <div style={is_expanded ? styles.selected_entry : styles.entry_style}>
      <Row
        align="middle"
        style={{ backgroundColor: background, paddingInlineStart: 8 }}
      >
        <Col md={12}>
          <Typography.Title level={5}>
            <a
              href=""
              onClick={(e) => {
                e.preventDefault();
                actions.toggle_item_expansion(
                  "assignment",
                  assignment.get("assignment_id"),
                );
              }}
            >
              <Space>
                <Icon name={is_expanded ? "caret-down" : "caret-right"} />
                {assignmentName}
              </Space>
            </a>
          </Typography.Title>
        </Col>
        <Col md={12}>
          {dueDate ? (
            <Space>
              Due
              <BigTime date={dueDate} />
            </Space>
          ) : null}
        </Col>
      </Row>
      {is_expanded ? (
        <CourseUnitCard
          unit={assignment}
          name={name}
          redux={redux}
          actions={actions}
          students={students}
          user_map={user_map}
          frame_id={frame_id}
          project_id={project_id}
          active_feedback_edits={active_feedback_edits}
          nbgrader_run_info={nbgrader_run_info}
          expand_peer_config={expand_peer_config}
        />
      ) : null}
    </div>
  );
}
