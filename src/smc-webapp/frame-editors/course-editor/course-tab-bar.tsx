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
}

export class CourseTabBar extends Component<Props> {
  private select_tab(key: string): void {
    console.log("key = ", key);
    this.props.actions.set_frame_type(this.props.frame_id, key);
  }

  public render(): Rendered {
    return (
      <Tabs
        defaultActiveKey={this.props.type}
        onChange={this.select_tab.bind(this)}
      >
        <TabPane tab="Students" key="course_students"></TabPane>
        <TabPane tab="Assignments" key="course_assignments"></TabPane>
        <TabPane tab="Handouts" key="course_handouts"></TabPane>
        <TabPane tab="Configuration" key="course_configuration"></TabPane>
        <TabPane tab="Shared Project" key="course_shared_project"></TabPane>
      </Tabs>
    );
  }
}
