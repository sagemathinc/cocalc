/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row } from "antd";
// React Libraries
import { useState } from "react";
import { useIntl } from "react-intl";

// CoCalc libraries
import { CopyStepStatus } from "../common";
import { course } from "@cocalc/frontend/i18n";
import { useButtonSize } from "../util";
import type { CourseActions } from "../actions";
import type { LastCopyInfo } from "../store";

interface StudentHandoutInfoProps {
  actions: CourseActions;
  info: { handout_id: string; student_id: string; status?: LastCopyInfo };
  title: string;
}

export function StudentHandoutInfo({
  actions,
  info,
  title,
}: StudentHandoutInfoProps) {
  const intl = useIntl();
  const size = useButtonSize();
  const [recopy, setRecopy] = useState<boolean>(false);

  const stepLabel = intl.formatMessage(course.distribute);
  const copyingLabel = intl.formatMessage({
    id: "course.handouts.distributing.label",
    defaultMessage: "Distributing",
    description: "Active state for distributing a handout to a student",
  });

  function open(handout_id: string, student_id: string): void {
    actions.handouts.open_handout(handout_id, student_id);
  }

  function copy(handout_id: string, student_id: string): void {
    actions.handouts.copy_handout_to_student(handout_id, student_id, false);
  }

  function stop(handout_id: string, student_id: string): void {
    actions.handouts.stop_copying_handout(handout_id, student_id);
  }

  return (
    <div>
      <Row
        style={{
          borderTop: "1px solid #aaa",
          paddingTop: "5px",
          paddingBottom: "5px",
        }}
      >
        <Col md={4} key="title">
          {title}
        </Col>
        <Col md={20} key="rest">
          <Row gutter={[8, 0]}>
            <Col flex="1" key="last_handout">
              <CopyStepStatus
                stepLabel={stepLabel}
                activityLabel={stepLabel}
                data={info.status}
                enableCopy
                tips={{
                  copy: "Copy the handout from your project to this student's project.",
                  open: "Open the student's copy of this handout directly in their project.  You will be able to see them type, chat with them, answer questions, etc.",
                }}
                handlers={{
                  open: () => open(info.handout_id, info.student_id),
                  copy: () => copy(info.handout_id, info.student_id),
                  stop: () => stop(info.handout_id, info.student_id),
                }}
                recopy={recopy}
                setRecopy={setRecopy}
                placement="right"
                size={size}
                copyingLabel={copyingLabel}
                openTitle="Open handout"
                openAriaLabel="Open handout folder"
                errorContext="handout"
              />
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
}
