import { CourseActions } from "../../course/actions";
export { CourseActions };

import { init_redux, remove_redux } from "../../course/redux";

export function course_redux_name(project_id: string, path: string): string {
  return `course-editor-${project_id}-${path}`;
}

export function init_course_actions_and_store(opts: {
  redux: any;
  path: string;
  project_id: string;
}): CourseActions {
  const name = course_redux_name(opts.project_id, opts.path);
  init_redux(opts.path, opts.redux, opts.project_id, name);
  const a = opts.redux.getActions(name);
  if (a == null) throw Error("bug");
  return a;
}

export function close_course_actions_and_store(opts: {
  redux: any;
  path: string;
  project_id: string;
}): void {
  remove_redux(
    opts.path,
    opts.redux,
    opts.project_id,
    course_redux_name(opts.project_id, opts.path)
  );
}
