/* This provides a tab bar to switch between various frame types.

It looks good and provides backwards UX compatibility for our users,
so they can mostly ignore the frame editor if they want to.
*/

import { React, Component, Rendered } from "../../app-framework";

import { Tabs } from "cocalc-ui";
const { TabPane } = Tabs;
import { CourseEditorActions } from "./actions";

interface Props {
  frame_id: string;
  type: string;
  actions: CourseEditorActions;
  counts: { students: number; assignments: number; handouts: number };
}

export class CourseTabBar extends Component<Props> {
  private select_tab(key: string): void {
    this.props.actions.set_frame_type(this.props.frame_id, key);
  }

  public render(): Rendered {
    return (
      <Tabs
        defaultActiveKey={this.props.type}
        onChange={this.select_tab.bind(this)}
      >
        <TabPane
          tab={`Students (${this.props.counts.students})`}
          key="course_students"
        ></TabPane>
        <TabPane
          tab={`Assignments (${this.props.counts.assignments})`}
          key="course_assignments"
        ></TabPane>
        <TabPane
          tab={`Handouts (${this.props.counts.handouts})`}
          key="course_handouts"
        ></TabPane>
        <TabPane tab="Configuration" key="course_configuration"></TabPane>
        <TabPane tab="Shared Project" key="course_shared_project"></TabPane>
      </Tabs>
    );
  }
}
