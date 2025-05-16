/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is some slightly complicated code to avoid needless duplication.

It's a bit more complicated than you might expect partly due to the fact
we have to insert these course tab components as frame in a frame tree,
so there is no common containing react component that we control...
*/

import { Map } from "immutable";

import {
  AppRedux,
  React,
  Rendered,
  redux,
  useEditorRedux,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ActivityDisplay, Loading } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import Modals from "@cocalc/frontend/course/modals";
import { PayBanner } from "@cocalc/frontend/course/pay-banner";
import {
  AssignmentsMap,
  CourseSettingsRecord,
  CourseStore,
  HandoutsMap,
  StudentsMap,
} from "@cocalc/frontend/course/store";
import { getScale } from "@cocalc/frontend/frame-editors/frame-tree/hooks";
import { ProjectMap, UserMap } from "@cocalc/frontend/todo-types";
import { values } from "@cocalc/util/misc";
import type { CourseEditorActions, CourseEditorState } from "./actions";
import { CourseActions, course_redux_name } from "./course-actions";
import { CourseTabBar } from "./course-tab-bar";

export interface FrameProps {
  id: string;
  name: string;
  project_id: string;
  path: string;
  font_size: number;
  course_panel: any; // TODO...
  actions: CourseEditorActions;
  desc: Map<string, any>;
}

export interface PanelProps {
  name: string;
  frame_id: string;
  project_id: string;
  path: string;
  students: StudentsMap;
  user_map: UserMap;
  project_map: ProjectMap;
  assignments: AssignmentsMap;
  handouts: HandoutsMap;
  settings: CourseSettingsRecord;
  redux: AppRedux;
  actions: CourseActions;
  configuring_projects?: boolean;
  reinviting_students?: boolean;
  frameActions: CourseEditorActions;
}

function CoursePanelWrapper(props: FrameProps) {
  const { id, project_id, path, font_size, course_panel, actions, desc } =
    props;
  const useEditor = useEditorRedux<CourseEditorState>({ project_id, path });
  const modal = useEditor("modal");
  const name = course_redux_name(project_id, path);

  const students: StudentsMap | undefined = useRedux(name, "students");
  const assignments: AssignmentsMap | undefined = useRedux(name, "assignments");
  const handouts: HandoutsMap | undefined = useRedux(name, "handouts");
  const settings: CourseSettingsRecord | undefined = useRedux(name, "settings");
  const configuring_projects: boolean | undefined = useRedux(
    name,
    "configuring_projects",
  );
  const reinviting_students: boolean | undefined = useRedux(
    name,
    "reinviting_students",
  );
  const activity: Map<string, any> | undefined = useRedux(name, "activity");
  const error: string | undefined = useRedux(name, "error");
  const user_map = useTypedRedux("users", "user_map");
  const project_map = useTypedRedux("projects", "project_map");

  function render_panel(): Rendered {
    if (
      students == null ||
      user_map == null ||
      project_map == null ||
      assignments == null ||
      handouts == null ||
      settings == null
    ) {
      return <Loading theme={"medium"} />;
    }

    const props: PanelProps = {
      frame_id: id,
      name,
      project_id,
      path,
      students,
      user_map,
      project_map,
      assignments,
      handouts,
      configuring_projects,
      reinviting_students,
      settings,
      redux,
      actions: redux.getActions(name),
      frameActions: actions,
    };

    return (
      <>
        {render_activity()}
        {render_error()}
        {render_pay_banner()}
        {render_tab_bar()}
        <div style={{ zoom: getScale(font_size) }} className="smc-vfill">
          {React.createElement(course_panel, props)}
        </div>
      </>
    );
  }

  function counts(): {
    students: number;
    assignments: number;
    handouts: number;
  } {
    const store: CourseStore = redux.getStore(name) as CourseStore;
    if (store == null) return { students: 0, assignments: 0, handouts: 0 }; // shouldn't happen?
    // have to use these functions on the store since only count non-deleted ones
    return {
      students: store.num_students(),
      assignments: store.num_assignments(),
      handouts: store.num_handouts(),
    };
  }

  function render_tab_bar(): Rendered {
    return (
      <CourseTabBar
        actions={actions}
        frame_id={id}
        type={desc.get("type")}
        counts={counts()}
      />
    );
  }

  function render_pay_banner(): Rendered {
    if (students == null || settings == null) return;
    return (
      <PayBanner
        show_config={() => {
          actions.setModal("upgrades");
        }}
        settings={settings}
        num_students={students.size}
      />
    );
  }

  function render_activity(): Rendered {
    if (activity == null) return;
    return (
      <ActivityDisplay
        activity={values(activity.toJS()) as any}
        trunc={80}
        on_clear={() => {
          const actions = redux.getActions(name) as CourseActions;
          if (actions != null) {
            actions.clear_activity();
          }
        }}
      />
    );
  }

  function render_error(): Rendered {
    return (
      <ShowError
        style={{ margin: "15px" }}
        error={error}
        setError={(error) => {
          const actions = redux.getActions(name) as CourseActions;
          actions?.set_error(error);
        }}
      />
    );
  }

  return (
    <div
      style={{
        padding: "0 15px",
        background: "#fafafa",
      }}
      className="smc-vfill"
    >
      <Modals
        frameActions={actions}
        actions={redux.getActions(name)}
        modal={modal}
        name={name}
        students={students}
        user_map={user_map}
        project_map={project_map}
        project_id={project_id}
        path={path}
        configuring_projects={configuring_projects}
        reinviting_students={reinviting_students}
        settings={settings}
        redux={redux}
      />
      {render_panel()}
    </div>
  );
}

export function wrap(Panel) {
  const course_panel = (props) => React.createElement(Panel, props);

  const Wrapped: React.FC<FrameProps> = (props: FrameProps) => {
    return React.createElement(CoursePanelWrapper, {
      ...{ course_panel },
      ...props,
    });
  };
  return Wrapped;
}
