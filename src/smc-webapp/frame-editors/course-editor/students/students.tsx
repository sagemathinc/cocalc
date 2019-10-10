import {
  React,
  Component,
  Rendered,
  rclass,
  redux,
  rtypes
} from "../../../app-framework";
import { StudentsPanel } from "../../../course/students_panel";
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

class Students extends Component<Props & ReduxProps> {
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

  private render_student_panel(): Rendered {
    if (
      this.props.students == null ||
      this.props.user_map == null ||
      this.props.project_map == null ||
      this.props.assignments == null
    ) {
      return <Loading theme={"medium"} />;
    }
    return (
      <div
        style={{ fontSize: `${this.props.font_size}pt` }}
        className="smc-vfill"
      >
        <StudentsPanel
          redux={redux}
          students={this.props.students}
          name={course_redux_name(this.props.project_id, this.props.path)}
          project_id={this.props.project_id}
          user_map={this.props.user_map}
          project_map={this.props.project_map}
          assignments={this.props.assignments}
        />
      </div>
    );
  }

  public render(): Rendered {
    return this.render_student_panel();
  }
}

const tmp = rclass(Students);
export { tmp as Students };
