/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is some slightly complicated code to avoid needless duplication.

It's a bit more complicated than you might expect partly due to the fact
we have to insert these course tab components as frame in a frame tree,
so there is no commoon containing react component that we control...
*/

import {
  React,
  Rendered,
  redux,
  AppRedux,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading, ActivityDisplay, ErrorDisplay } from "../../components";
import {
  AssignmentsMap,
  CourseSettingsRecord,
  StudentsMap,
  HandoutsMap,
} from "../../course/store";
import { Map } from "immutable";
import { ProjectMap, UserMap } from "../../todo-types";
import { CourseActions, course_redux_name } from "./course-actions";
import { values } from "@cocalc/util/misc";
import { CourseTabBar } from "./course-tab-bar";
import { CourseEditorActions } from "./actions";
import { CourseStore } from "../../course/store";
import { PayBanner } from "../../course/pay-banner";

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
}

const CoursePanelWrapper: React.FC<FrameProps> = React.memo(
  (props: FrameProps) => {
    const { id, project_id, path, font_size, course_panel, actions, desc } =
      props;

    const name = course_redux_name(project_id, path);

    const students: StudentsMap | undefined = useRedux(name, "students");
    const assignments: AssignmentsMap | undefined = useRedux(
      name,
      "assignments"
    );
    const handouts: HandoutsMap | undefined = useRedux(name, "handouts");
    const settings: CourseSettingsRecord | undefined = useRedux(
      name,
      "settings"
    );
    const configuring_projects: boolean | undefined = useRedux(
      name,
      "configuring_projects"
    );
    const reinviting_students: boolean | undefined = useRedux(
      name,
      "reinviting_students"
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
      };

      return (
        <>
          {render_activity()}
          {render_error()}
          {render_pay_banner()}
          {render_tab_bar()}
          {React.createElement(course_panel, props)}
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
            actions.set_frame_type(id, "course_configuration");
          }}
          settings={settings}
          num_students={students.size}
          tab={desc.get("type", "").slice("course_".length)}
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
            if (actions != null) actions.clear_activity();
          }}
        />
      );
    }

    function render_error(): Rendered {
      if (!error) return;
      return (
        <ErrorDisplay
          banner={true}
          error={error}
          onClose={() => {
            const actions = redux.getActions(name) as CourseActions;
            if (actions != null) actions.set_error("");
          }}
        />
      );
    }

    return (
      <div
        style={{ fontSize: `${font_size}px`, margin: "0 0 0 15px" }}
        className="smc-vfill"
      >
        {render_panel()}
      </div>
    );
  }
);

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
