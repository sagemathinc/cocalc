/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* This provides a tab bar to switch between various frame types.

It looks good and provides backwards UX compatibility for our users,
so they can mostly ignore the frame editor if they want to.
*/

import { Tabs } from "antd";
import { useIntl } from "react-intl";

import { Tab } from "@cocalc/frontend/antd-bootstrap";
import { course, labels } from "@cocalc/frontend/i18n";
import { CourseEditorActions } from "./actions";

interface Props {
  frame_id: string;
  type: string;
  actions: CourseEditorActions;
  counts: { students: number; assignments: number; handouts: number };
}

export const CourseTabBar: React.FC<Props> = (props: Props) => {
  const { frame_id, type, actions, counts } = props;

  const intl = useIntl();

  function select_tab(key: string): void {
    actions.set_frame_type(frame_id, key);
  }

  const items = [
    Tab({
      eventKey: "course_students",
      title: `${intl.formatMessage(course.students)} (${counts.students})`,
    }),
    Tab({
      eventKey: "course_assignments",
      title: `${intl.formatMessage(course.assignments)} (${
        counts.assignments
      })`,
    }),
    Tab({
      eventKey: "course_handouts",
      title: `${intl.formatMessage(course.handouts)} (${counts.handouts})`,
    }),
    Tab({
      eventKey: "course_actions",
      title: intl.formatMessage(course.actions),
    }),
    Tab({
      eventKey: "course_configuration",
      title: intl.formatMessage(labels.configuration),
    }),
    Tab({
      eventKey: "course_shared_project",
      title: intl.formatMessage(course.shared_project),
    }),
  ];

  return (
    <Tabs
      defaultActiveKey={type}
      onChange={select_tab.bind(this)}
      animated={false}
      items={items}
    />
  );
};
