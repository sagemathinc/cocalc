/*
This is some slightly complicated code to avoid needless duplication.

It's a bit more complicated than you might expect partly due to the fact
we have to insert these course tab components as frame in a frame tree,
so there is no commoon containing react component that we control...
*/

import {
  React,
  Component,
  Rendered,
  rclass,
  redux,
  rtypes,
  AppRedux
} from "../../app-framework";
import { Loading } from "../../r_misc";
import { AssignmentsMap, StudentsMap, HandoutsMap } from "../../course/store";
import { ProjectMap, UserMap } from "../../todo-types";
import { CourseActions, course_redux_name } from "./course-actions";
import { merge } from "smc-util/misc2";

export interface FrameProps {
  name: string;
  project_id: string;
  path: string;
  font_size: number;
  course_panel: any;
}

interface ReduxProps {
  students?: StudentsMap;
  user_map?: UserMap;
  project_map?: ProjectMap;
  assignments?: AssignmentsMap;
  handouts?: HandoutsMap;
}

export interface PanelProps {
  name: string;
  project_id: string;
  path: string;
  students: StudentsMap;
  user_map: UserMap;
  project_map: ProjectMap;
  assignments: AssignmentsMap;
  handouts: HandoutsMap;
  redux: AppRedux;
  actions: CourseActions;
}

class CoursePanelWrapper extends Component<FrameProps & ReduxProps> {
  static reduxProps = ({ project_id, path }) => {
    const name = course_redux_name(project_id, path);
    return {
      [name]: {
        students: rtypes.immutable.Map,
        assignments: rtypes.immutable.Map,
        handouts: rtypes.immutable.Map
      },
      users: {
        user_map: rtypes.immutable
      },
      projects: {
        project_map: rtypes.immutable
      }
    };
  };

  public render(): Rendered {
    if (
      this.props.students == null ||
      this.props.user_map == null ||
      this.props.project_map == null ||
      this.props.assignments == null ||
      this.props.handouts == null
    ) {
      return <Loading theme={"medium"} />;
    }

    const name = course_redux_name(this.props.project_id, this.props.path);

    const props: PanelProps = {
      name,
      project_id: this.props.project_id,
      path: this.props.path,
      students: this.props.students,
      user_map: this.props.user_map,
      project_map: this.props.project_map,
      assignments: this.props.assignments,
      handouts: this.props.handouts,
      redux,
      actions: redux.getActions(name)
    };

    return (
      <div
        style={{ fontSize: `${this.props.font_size}px` }}
        className="smc-vfill"
      >
        {React.createElement(this.props.course_panel, props)}
      </div>
    );
  }
}

const ReduxCoursePanelWrapper = rclass(CoursePanelWrapper);

export function wrap(Panel) {
  const course_panel = props => React.createElement(Panel, props);

  class Wrapped extends Component<FrameProps> {
    public render(): Rendered {
      return React.createElement(
        ReduxCoursePanelWrapper,
        merge({ course_panel }, this.props)
      );
    }
  }
  return Wrapped;
}
