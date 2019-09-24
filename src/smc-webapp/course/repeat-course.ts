import { CourseStore } from "./store";
import { init_redux, remove_redux } from "./main";
import { AppRedux } from "../app-framework";
import { CourseActions } from "./actions";
import { callback2 } from "smc-util/async-utils";

// Create a new file
// Open a new syncdb on that file
// Copy over relevant paths of old syncdb
export async function repeat_course(
  new_name: string,
  store: CourseStore,
  redux: AppRedux
): Promise<void> {
  const project_id = store.get("course_project_id");
  await callback2(redux.getProjectActions(project_id).create_file, {
    name: new_name,
    ext: "course"
  });
  const tmp_name = new_name + project_id;

  const new_course_redux_id = init_redux(tmp_name, redux, project_id);

  const new_actions = redux.getActions<CourseActions>(new_course_redux_id);

  store // Add all old assignment paths
    .get("assignments")
    .map(x => x.get("path"))
    .map(new_actions.add_assignment);
  store // Add all old handout paths
    .get("handouts")
    .map(x => x.get("path"))
    .map(new_actions.add_handout);

  remove_redux(tmp_name, redux, project_id);
}
