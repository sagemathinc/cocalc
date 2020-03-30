import { StudentsMap, StudentRecord } from "../store";
import {
  exec,
  query,
  write_text_file_to_project,
} from "../../frame-editors/generic/client";
import { split } from "smc-util/misc2";

interface PathUseTimes {
  edit_times: number[];
  access_times: number[];
}

interface StudentUseTimes {
  student_id: string;
  account_id?: string;
  project_id?: string;
  student_name: string;
  assignment_path: string;
  paths?: { [path: string]: PathUseTimes };
  error?: string; // if it fails for some non-obvious reason
}

async function one_student_file_use_times(
  paths: string[],
  project_id: string,
  account_id: string,
  limit: number = 1000
): Promise<{ [path: string]: PathUseTimes }> {
  project_id = project_id;
  account_id = account_id;
  const times: { [path: string]: PathUseTimes } = {};
  for (const path of paths) {
    const q = await query({
      query: {
        file_use_times: {
          project_id,
          account_id,
          path,
          access_times: null,
          edit_times: null,
        },
      },
      options: [{ limit }],
    });
    const { edit_times, access_times } = q.query.file_use_times;
    times[path] = { edit_times, access_times };
  }
  return times;
}

function student_info(
  assignment_path: string,
  student: StudentRecord,
  get_name: Function
): StudentUseTimes {
  const student_id = student.get("student_id");
  const x: StudentUseTimes = {
    student_id,
    student_name: get_name(student_id),
    assignment_path,
  };
  for (const field of ["account_id", "project_id"]) {
    if (student.has(field)) {
      x[field] = student.get(field);
    }
  }
  return x;
}

async function paths_to_scan(
  project_id: string,
  src_path: string,
  target_path: string
): Promise<string[]> {
  const { stdout } = await exec({
    command: "find",
    args: ["."],
    path: src_path,
    err_on_exit: true,
    project_id,
  });
  const v: string[] = [];
  for (const path of split(stdout)) {
    const path2 = path.slice(2);
    if (path2) {
      v.push(target_path + "/" + path2);
    }
  }
  return v;
}

export async function all_students_file_use_times(
  course_project_id: string,
  src_path: string,
  target_path: string,
  students: StudentsMap,
  get_name: Function
): Promise<{ [student_id: string]: StudentUseTimes }> {
  const paths = await paths_to_scan(course_project_id, src_path, target_path);

  // Iterate through the (nondeleted) students determining to what extent
  // they used files in the given path in their projects.
  const times: { [student_id: string]: StudentUseTimes } = {};
  for (const [student_id, student] of students) {
    if (student.get("deleted")) continue;
    const info = (times[student_id] = student_info(
      target_path,
      student,
      get_name
    ));
    if (info.project_id == null || info.account_id == null) {
      // nothing more to do, since no account or project
      continue;
    }
    try {
      info.paths = await one_student_file_use_times(
        paths,
        info.project_id,
        info.account_id
      );
    } catch (err) {
      info.error = `${err}`;
    }
  }
  return times;
}

export async function export_student_file_use_times(
  course_project_id: string,
  src_path: string,
  target_path: string,
  students: StudentsMap,
  target_json: string,
  get_name: Function
): Promise<void> {
  const x = await all_students_file_use_times(
    course_project_id,
    src_path,
    target_path,
    students,
    get_name
  );
  await write_text_file_to_project({
    project_id: course_project_id,
    path: target_json,
    content: JSON.stringify(x, null, 2),
  });
}
