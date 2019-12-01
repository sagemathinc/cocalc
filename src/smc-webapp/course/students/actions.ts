/*
Actions specific to manipulating the students in a course
*/

import { CourseActions, PARALLEL_LIMIT } from "../actions";
import { CourseStore, StudentRecord } from "../store";
import { SyncDBRecordStudent } from "../types";
import { callback2 } from "smc-util/async-utils";
import { map } from "awaiting";
import { redux } from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import { defaults, required, uuid } from "smc-util/misc";

export class StudentsActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private get_store(): CourseStore {
    const store = this.course_actions.get_store();
    if (store == null) throw Error("no store");
    return store;
  }

  public async add_students(
    students: { account_id?: string; email_address?: string }[]
  ): Promise<void> {
    // students = array of objects that may have an account_id or email_address field set
    // New student_id's will be constructed randomly for each student
    const student_ids: string[] = [];
    for (const x of students) {
      if (x.account_id == null && x.email_address == null) continue; // nothing to do
      const student_id = uuid();
      student_ids.push(student_id);
      const y = x as SyncDBRecordStudent;
      y.table = "students";
      y.student_id = student_id;
      this.course_actions.syncdb.set(y);
    }
    this.course_actions.syncdb.commit();
    async function f(student_id: string): Promise<void> {
      let store = this.get_store();
      await callback2(store.wait, {
        until: (store: CourseStore) => store.get_student(student_id),
        timeout: 60
      });
      this.course_actions.student_projects.create_student_project(student_id);
      store = this.get_store();
      await callback2(store.wait, {
        until: (store: CourseStore) =>
          store.getIn(["students", student_id, "project_id"]),
        timeout: 60
      });
    }

    const id = this.course_actions.set_activity({
      desc: `Creating ${students.length} student projects (do not close the course until done)`
    });

    try {
      await map(student_ids, PARALLEL_LIMIT, f.bind(this));
    } catch (err) {
      if (this.course_actions.is_closed()) return;
      this.course_actions.set_error(
        `error creating student projects -- ${err}`
      );
    } finally {
      if (this.course_actions.is_closed()) return;
      this.course_actions.set_activity({ id });
      // after adding students, always run configure all projects,
      // to ensure everything is set properly
      await this.course_actions.student_projects.configure_all_projects();
    }
  }

  public async delete_student(student_id: string): Promise<void> {
    const store = this.get_store();
    const student = store.get_student(student_id);
    if (student == null) return;
    await this.do_delete_student(student);
    await this.course_actions.student_projects.configure_all_projects(); // since they may get removed from shared project, etc.
  }

  public async undelete_student(student_id: string): Promise<void> {
    this.course_actions.set({
      deleted: false,
      student_id,
      table: "students"
    });
    // configure, since they may get added back to shared project, etc.
    await this.course_actions.student_projects.configure_all_projects();
  }

  public async delete_all_students(): Promise<void> {
    const store = this.get_store();
    const students = store
      .get_students()
      .valueSeq()
      .toArray();
    await map(students, PARALLEL_LIMIT, this.do_delete_student.bind(this));
    await this.course_actions.student_projects.configure_all_projects();
  }

  private async do_delete_student(student: StudentRecord): Promise<void> {
    const project_id = student.get("project_id");
    if (project_id != null) {
      // The student's project was created so let's clear any upgrades from it.
      redux.getActions("projects").clear_project_upgrades(project_id);
    }
    this.course_actions.set({
      deleted: true,
      student_id: student.get("student_id"),
      table: "students"
    });
  }

  // Some students might *only* have been added using their email address, but they
  // subsequently signed up for an CoCalc account.  We check for any of these and if
  // we find any, we add in the account_id information about that student.
  public async lookup_nonregistered_students(): Promise<void> {
    const store = this.get_store();
    const v: { [email: string]: string } = {};
    const s: string[] = [];
    store.get_students().map((student: StudentRecord, student_id: string) => {
      if (!student.get("account_id") && !student.get("deleted")) {
        const email = student.get("email_address");
        v[email] = student_id;
        s.push(email);
      }
    });
    if (s.length == 0) return;
    try {
      const result = await callback2(webapp_client.user_search, {
        query: s.join(","),
        limit: s.length
      });
      for (const x of result) {
        this.course_actions.set({
          account_id: x.account_id,
          table: "students",
          student_id: v[x.email_address]
        });
      }
    } catch (err) {
      // Non-fatal, will try again next time lookup_nonregistered_students gets called.
      console.warn(`lookup_nonregistered_students: search error -- ${err}`);
    }
  }

  // columns: first_name, last_name, email, last_active, hosting
  // Toggles ascending/decending order
  public set_active_student_sort(column_name: string): void {
    let is_descending: boolean;
    const store = this.get_store();
    const current_column = store.getIn(["active_student_sort", "column_name"]);
    if (current_column === column_name) {
      is_descending = !store.getIn(["active_student_sort", "is_descending"]);
    } else {
      is_descending = false;
    }
    this.course_actions.setState({
      active_student_sort: { column_name, is_descending }
    });
  }

  public async set_internal_student_info(
    student_id: string,
    info: { first_name: string; last_name: string; email_address?: string }
  ): Promise<void> {
    const { student } = this.course_actions.resolve({ student_id });
    if (student == null) return;

    info = defaults(info, {
      first_name: required,
      last_name: required,
      email_address: student.get("email_address")
    });

    this.course_actions.set({
      first_name: info.first_name,
      last_name: info.last_name,
      email_address: info.email_address,
      student_id,
      table: "students"
    });

    // since they may get removed from shared project, etc.
    await this.course_actions.student_projects.configure_all_projects();
  }

  public set_student_note(student_id: string, note: string): void {
    this.course_actions.set({
      note,
      table: "students",
      student_id
    });
  }
}
