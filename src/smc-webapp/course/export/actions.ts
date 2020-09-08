/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { replace_all, split } from "smc-util/misc";
import { redux } from "../../app-framework";
import { webapp_client } from "../../webapp-client";

import { CourseActions } from "../actions";
import { CourseStore } from "../store";

export class ExportActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private get_store(): CourseStore {
    return this.course_actions.get_store();
  }

  private path(ext: string, what: string): string {
    // make path more likely to be python-readable...
    const path = this.get_store().get("course_filename");
    const p: string = split(replace_all(path, "-", "_")).join("_");
    const i: number = p.lastIndexOf(".");
    return `course-exports/${p.slice(0, i)}/${what}.${ext}`;
  }

  private open_file(path: string): void {
    const project_id = this.get_store().get("course_project_id");
    redux.getProjectActions(project_id).open_file({
      path,
      foreground: true,
    });
  }

  private async write_file(path: string, content: string): Promise<void> {
    const actions = this.course_actions;
    const id = actions.set_activity({ desc: `Writing ${path}` });
    const project_id = this.get_store().get("course_project_id");
    try {
      await webapp_client.project_client.write_text_file({
        project_id,
        path,
        content,
      });
      if (actions.is_closed()) return;
      this.open_file(path);
    } catch (err) {
      if (actions.is_closed()) return;
      actions.set_error(`Error writing '${path}' -- '${err}'`);
    } finally {
      if (actions.is_closed()) return;
      actions.set_activity({ id });
    }
  }

  // newlines and duplicated double-quotes
  private sanitize_csv_entry(s: string): string {
    return s.replace(/\n/g, "\\n").replace(/"/g, '""');
  }

  public async to_csv(): Promise<void> {
    const store = this.get_store();
    const assignments = store.get_sorted_assignments();
    // CSV definition: http://edoceo.com/utilitas/csv-file-format
    // i.e. double quotes everywhere (not single!) and double quote in double quotes usually blows up
    const timestamp = webapp_client.server_time().toISOString();
    let content = `# Course '${store.getIn(["settings", "title"])}'\n`;
    content += `# exported ${timestamp}\n`;
    content += "Name,Id,Email,";
    content +=
      (() => {
        const result: any[] = [];
        for (const assignment of assignments) {
          result.push(`\"grade: ${assignment.get("path")}\"`);
        }
        return result;
      })().join(",") + ",";
    content +=
      (() => {
        const result1: any[] = [];
        for (const assignment of assignments) {
          result1.push(`\"comments: ${assignment.get("path")}\"`);
        }
        return result1;
      })().join(",") + "\n";
    for (const student of store.get_sorted_students()) {
      var left2;
      const grades = (() => {
        const result2: any[] = [];
        for (const assignment of assignments) {
          let grade = store.get_grade(
            assignment.get("assignment_id"),
            student.get("student_id")
          );
          grade = grade != null ? grade : "";
          grade = this.sanitize_csv_entry(grade);
          result2.push(`\"${grade}\"`);
        }
        return result2;
      })().join(",");

      const comments = (() => {
        const result3: any[] = [];
        for (const assignment of assignments) {
          let comment = store.get_comments(
            assignment.get("assignment_id"),
            student.get("student_id")
          );
          comment = comment != null ? comment : "";
          comment = this.sanitize_csv_entry(comment);
          result3.push(`\"${comment}\"`);
        }
        return result3;
      })().join(",");
      const name = `\"${this.sanitize_csv_entry(
        store.get_student_name(student.get("student_id"))
      )}\"`;
      const email = `\"${
        (left2 = store.get_student_email(student.get("student_id"))) != null
          ? left2
          : ""
      }\"`;
      const id = `\"${student.get("student_id")}\"`;
      const line = [name, id, email, grades, comments].join(",");
      content += line + "\n";
    }
    this.write_file(this.path("csv", "grades"), content);
  }

  private export_grades(): object {
    const obj: any = {};
    const store = this.get_store();
    const assignments = store.get_sorted_assignments();
    obj.course = store.getIn(["settings", "title"]);
    obj.exported = webapp_client.server_time().toISOString();
    obj.assignments = [] as string[];
    for (const assignment of assignments) {
      obj.assignments.push(assignment.get("path"));
    }
    const students: any[] = [];
    for (const student of store.get_sorted_students()) {
      const student_id = student.get("student_id");
      const grades: string[] = [];
      for (const assignment of assignments) {
        const assignment_id = assignment.get("assignment_id");
        const grade = store.get_grade(assignment_id, student_id);
        grades.push(grade);
      }
      const comments: string[] = [];
      for (const assignment of assignments) {
        const assignment_id = assignment.get("assignment_id");
        const comment = store.get_comments(assignment_id, student_id);
        comments.push(comment);
      }
      const nbgrader: any[] = [];
      for (const assignment of assignments) {
        const x =
          assignment.getIn(["nbgrader_scores", student_id])?.toJS() ?? {};
        for (const path in x) {
          for (const id in x[path]) {
            const entry = x[path][id];
            delete entry.manual;
          }
        }
        nbgrader.push(x);
      }
      const name = store.get_student_name(student_id);
      let email = store.get_student_email(student_id) ?? "None";
      const id = student.get("student_id");
      students.push({ name, id, email, grades, nbgrader, comments });
    }
    obj.students = students;
    return obj;
  }

  public async to_json(): Promise<void> {
    const obj = this.export_grades();
    this.write_file(
      this.path("json", "grades"),
      JSON.stringify(obj, undefined, 2)
    );
  }

  public async to_py(): Promise<void> {
    const obj = this.export_grades();
    let content = "";
    for (const key in obj) {
      content += `${key} = ${JSON.stringify(obj[key], undefined, 2)}\n`;
    }
    this.write_file(this.path("py", "grades"), content);
  }

  public async file_use_times(assignment_or_handout_id: string): Promise<void> {
    const id = this.course_actions.set_activity({
      desc: "Exporting file use times...",
    });
    try {
      const { assignment, handout } = this.course_actions.resolve({
        assignment_id: assignment_or_handout_id,
        handout_id: assignment_or_handout_id,
      });
      if (assignment != null) {
        const target_json = this.path(
          "json",
          "file-use-times/assignment/" +
            replace_all(assignment.get("path"), "/", "-")
        );
        await this.course_actions.assignments.export_file_use_times(
          assignment_or_handout_id,
          target_json
        );
        this.open_file(target_json);
      } else if (handout != null) {
        const target_json = this.path(
          "json",
          "file-use-times/handouts/" +
            replace_all(handout.get("path"), "/", "-")
        );
        await this.course_actions.handouts.export_file_use_times(
          assignment_or_handout_id,
          target_json
        );
        this.open_file(target_json);
      } else {
        throw Error(
          `Unknown handout or assignment "${assignment_or_handout_id}"`
        );
      }
    } catch (err) {
      this.course_actions.set_error(`Error exporting file use times -- ${err}`);
    } finally {
      this.course_actions.set_activity({ id });
    }
  }
}
