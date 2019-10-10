import { CourseActions } from "../../course/actions";
export { CourseActions };
import { init_redux, remove_redux } from "../../course/main";

export function init_course_actions_and_store(opts: {
  redux: any;
  path: string;
  project_id: string;
}): CourseActions {
  const name = init_redux(opts.path, opts.redux, opts.project_id);
  const a = opts.redux.getActions(name);
  if (a == null) throw Error("bug");
  return a;
}

export function close_course_actions_and_store(opts: {
  redux: any;
  path: string;
  project_id: string;
}): void {
  remove_redux(opts.path, opts.redux, opts.project_id);
}
