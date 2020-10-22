/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* This provides a tab bar to switch between various frame types.

It looks good and provides backwards UX compatibility for our users,
so they can mostly ignore the frame editor if they want to.
*/

import { React } from "../../app-framework";

import { Tabs } from "antd";
const { TabPane } = Tabs;
import { CourseEditorActions } from "./actions";

interface Props {
  frame_id: string;
  type: string;
  actions: CourseEditorActions;
  counts: {
    students: number;
    assignments: number;
    handouts: number;
    groupings: number;
  };
}

export const CourseTabBar: React.FC<Props> = ({
  frame_id,
  type,
  actions,
  counts,
}) => {
  return (
    <Tabs
      defaultActiveKey={type}
      onChange={(key) => actions.set_frame_type(frame_id, key)}
      animated={false}
    >
      <TabPane
        tab={`Students (${counts.students})`}
        key="course_students"
      ></TabPane>
      <TabPane
        tab={`Assignments (${counts.assignments})`}
        key="course_assignments"
      ></TabPane>
      <TabPane
        tab={`Handouts (${counts.handouts})`}
        key="course_handouts"
      ></TabPane>
      <TabPane
        tab={`Groupings (${counts.groupings})`}
        key="course_groupings"
      ></TabPane>
      <TabPane tab="Configuration" key="course_configuration"></TabPane>
      <TabPane tab="Shared Project" key="course_shared_project"></TabPane>
    </Tabs>
  );
};
