import {
  React,
  Component,
  Rendered,
  rclass,
  redux,
  rtypes
} from "../../../app-framework";
import { AssignmentsPanel } from "../../../course/assignments_panel";
import { Loading } from "../../../r_misc";
import { AssignmentsMap, StudentsMap } from "../../../course/store";
import { ProjectMap, UserMap } from "../../../todo-types";
import { course_redux_name } from "../course-actions";

interface Props {
  name: string;
  project_id: string;
  path: string;
  font_size: number;
}

interface ReduxProps {
  students?: StudentsMap;
  user_map?: UserMap;
  project_map?: ProjectMap;
  assignments?: AssignmentsMap;
}

class Assignments extends Component<Props & ReduxProps> {
  static reduxProps = ({ project_id, path }) => {
    return {
      [course_redux_name(project_id, path)]: {
        students: rtypes.immutable.Map,
        assignments: rtypes.immutable.Map
      },
      users: {
        user_map: rtypes.immutable
      },
      projects: {
        project_map: rtypes.immutable
      }
    };
  }; // gets updated when student is active on their project

  private render_assignments_panel(): Rendered {
    if (
      this.props.students == null ||
      this.props.user_map == null ||
      this.props.project_map == null ||
      this.props.assignments == null
    ) {
      return <Loading theme={"medium"} />;
    }

    const name = course_redux_name(this.props.project_id, this.props.path);
    return (
      <div
        style={{ fontSize: `${this.props.font_size}pt` }}
        className="smc-vfill"
      >
        <AssignmentsPanel
          actions={redux.getActions(name)}
          redux={redux}
          all_assignments={this.props.assignments}
          name={name}
          project_id={this.props.project_id}
          user_map={this.props.user_map}
          students={this.props.students}
        />
      </div>
    );
  }

  public render(): Rendered {
    return this.render_assignments_panel();
  }
}

const tmp = rclass(Assignments);
export { tmp as Assignments };
