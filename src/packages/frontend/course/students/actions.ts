/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Actions specific to manipulating the students in a course
*/

import { delay, map } from "awaiting";
import { redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { callback2 } from "@cocalc/util/async-utils";
import { defaults, required, uuid } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { CourseActions } from "../actions";
import { CourseStore, StudentRecord } from "../store";
import type { SyncDBRecordStudent } from "../types";
import { Map as iMap } from "immutable";

const STUDENT_STATUS_UPDATE_MS = 60 * 1000;

export class StudentsActions {
  private course_actions: CourseActions;
  private updateInterval?;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
    this.push_missing_handouts_and_assignments = reuseInFlight(
      this.push_missing_handouts_and_assignments.bind(this),
    );
    setTimeout(this.updateStudentStatus, 5000);
    this.updateInterval = setInterval(
      this.updateStudentStatus,
      STUDENT_STATUS_UPDATE_MS,
    );
  }

  private get_store(): CourseStore {
    const store = this.course_actions.get_store();
    if (store == null) throw Error("no store");
    return store;
  }

  public async add_students(
    students: { account_id?: string; email_address?: string }[],
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
    const f: (student_id: string) => Promise<void> = async (student_id) => {
      let store = this.get_store();
      await callback2(store.wait, {
        until: (store: CourseStore) => store.get_student(student_id),
        timeout: 60,
      });
      this.course_actions.student_projects.create_student_project(student_id);
      store = this.get_store();
      await callback2(store.wait, {
        until: (store: CourseStore) =>
          store.getIn(["students", student_id, "project_id"]),
        timeout: 60,
      });
    };

    const id = this.course_actions.set_activity({
      desc: `Creating ${students.length} student projects (do not close the course until done)`,
    });

    try {
      await map(student_ids, this.get_store().get_copy_parallel(), f);
    } catch (err) {
      if (this.course_actions.is_closed()) return;
      this.course_actions.set_error(
        `error creating student projects -- ${err}`,
      );
    } finally {
      if (this.course_actions.is_closed()) return;
      this.course_actions.set_activity({ id });
      // after adding students, always run configure all projects,
      // to ensure everything is set properly
      await this.course_actions.student_projects.configure_all_projects();
    }
  }

  public async delete_student(
    student_id: string,
    noTrash = false,
  ): Promise<void> {
    const store = this.get_store();
    const student = store.get_student(student_id);
    if (student == null) {
      return;
    }
    this.doDeleteStudent(student, noTrash);
    // We always remove any deleted student from all student projects and the
    // shared project when they are deleted, since this best aligns with
    // user expectations.  We do this, even if "allow collaborators" is enabled.
    await this.course_actions.student_projects.removeFromAllStudentProjects(
      student,
    );
  }

  undelete_student = async (student_id: string): Promise<void> => {
    this.course_actions.set({
      deleted: false,
      student_id,
      table: "students",
    });
    // configure, since they may get added back to shared project, etc.
    await delay(1); // so store is updated, since it is used by configure
    await this.course_actions.student_projects.configure_all_projects();
  };

  deleteAllStudents = async (noTrash = false): Promise<void> => {
    const store = this.get_store();
    const students = store.get_students().valueSeq().toArray();
    for (const student of students) {
      this.doDeleteStudent(student, noTrash, false);
    }
    this.course_actions.syncdb.commit();
    await delay(1); // so store is updated, since it is used by configure
    await this.course_actions.student_projects.configure_all_projects();
  };

  private doDeleteStudent = (
    student: StudentRecord,
    noTrash = false,
    commit = true,
  ): void => {
    const project_id = student.get("project_id");
    if (project_id != null) {
      // The student's project was created so let's clear any upgrades from it.
      redux.getActions("projects").clear_project_upgrades(project_id);
    }
    if (noTrash) {
      this.course_actions.delete(
        {
          student_id: student.get("student_id"),
          table: "students",
        },
        commit,
      );
    } else {
      this.course_actions.set(
        {
          deleted: true,
          student_id: student.get("student_id"),
          table: "students",
        },
        commit,
      );
    }
  };

  // Some students might *only* have been added using their email address, but they
  // subsequently signed up for an CoCalc account.  We check for any of these and if
  // we find any, we add in the account_id information about that student.
  lookupNonregisteredStudents = async (): Promise<void> => {
    const store = this.get_store();
    const v: { [email: string]: string } = {};
    const s: string[] = [];
    store.get_students().map((student: StudentRecord, student_id: string) => {
      if (!student.get("account_id") && !student.get("deleted")) {
        const email = student.get("email_address");
        if (email) {
          v[email] = student_id;
          s.push(email);
        }
      }
    });
    if (s.length == 0) {
      return;
    }
    try {
      const result = await webapp_client.users_client.user_search({
        query: s.join(","),
        limit: s.length,
        only_email: true,
      });
      for (const x of result) {
        if (x.email_address == null) {
          continue;
        }
        this.course_actions.set({
          student_id: v[x.email_address],
          account_id: x.account_id,
          table: "students",
        });
      }
    } catch (err) {
      // Non-fatal, will try again next time lookupNonregisteredStudents gets called.
      console.warn(`lookupNonregisteredStudents: search error -- ${err}`);
    }
  };

  // For every student with a known account_id, verify that their
  // account still exists, and if not, mark it as deleted.  This is rare, but happens
  // despite all attempts otherwise: https://github.com/sagemathinc/cocalc/issues/3243
  updateDeletedAccounts = async () => {
    const store = this.get_store();
    const account_ids: string[] = [];
    const student_ids: { [account_id: string]: string } = {};
    store.get_students().map((student: StudentRecord) => {
      const account_id = student.get("account_id");
      if (account_id && !student.get("deleted_account")) {
        account_ids.push(account_id);
        student_ids[account_id] = student.get("student_id");
      }
    });
    if (account_ids.length == 0) {
      return;
    }
    // note: there is no notion of undeleting an account in cocalc
    const users = await webapp_client.users_client.getNames(account_ids);
    for (const account_id of account_ids) {
      if (users[account_id] == null) {
        this.course_actions.set({
          student_id: student_ids[account_id],
          account_id,
          table: "students",
          deleted_account: true,
        });
      }
    }
  };

  updateStudentStatus = async () => {
    const state = this.course_actions.syncdb?.get_state();
    if (state == "init") {
      return;
    }
    if (state != "ready") {
      clearInterval(this.updateInterval);
      delete this.updateInterval;
      return;
    }
    await this.lookupNonregisteredStudents();
    await this.updateDeletedAccounts();
  };

  // columns: first_name, last_name, email, last_active, hosting
  // Toggles ascending/decending order
  set_active_student_sort = (column_name: string): void => {
    let is_descending: boolean;
    const store = this.get_store();
    const current_column = store.getIn(["active_student_sort", "column_name"]);
    if (current_column === column_name) {
      is_descending = !store.getIn(["active_student_sort", "is_descending"]);
    } else {
      is_descending = false;
    }
    this.course_actions.setState({
      active_student_sort: { column_name, is_descending },
    });
  };

  set_internal_student_info = async (
    student_id: string,
    info: { first_name: string; last_name: string; email_address?: string },
  ): Promise<void> => {
    const { student } = this.course_actions.resolve({ student_id });
    if (student == null) return;

    info = defaults(info, {
      first_name: required,
      last_name: required,
      email_address: student.get("email_address"),
    });

    this.course_actions.set({
      first_name: info.first_name,
      last_name: info.last_name,
      email_address: info.email_address,
      student_id,
      table: "students",
    });

    // since they may get removed from shared project, etc.
    await this.course_actions.student_projects.configure_all_projects();
  };

  set_student_note = (student_id: string, note: string): void => {
    this.course_actions.set({
      note,
      table: "students",
      student_id,
    });
  };

  /*
  Function to "catch up a student" by pushing out all (non-deleted) handouts and assignments to
  this student that have been pushed to at least one student so far.
  */
  push_missing_handouts_and_assignments = async (
    student_id: string,
  ): Promise<void> => {
    const { student, store } = this.course_actions.resolve({ student_id });
    if (student == null) {
      throw Error("no such student");
    }
    const name = store.get_student_name(student_id);
    const id = this.course_actions.set_activity({
      desc: `Catching up ${name}...`,
    });
    try {
      for (const assignment_id of store.get_assigned_assignment_ids()) {
        if (
          !store.student_assignment_info(student_id, assignment_id)
            .last_assignment
        ) {
          await this.course_actions.assignments.copy_assignment(
            "assigned",
            assignment_id,
            student_id,
          );
          if (this.course_actions.is_closed()) return;
        }
      }
      for (const handout_id of store.get_assigned_handout_ids()) {
        if (store.student_handout_info(student_id, handout_id).status == null) {
          await this.course_actions.handouts.copy_handout_to_student(
            handout_id,
            student_id,
            true,
          );
          if (this.course_actions.is_closed()) return;
        }
      }
    } finally {
      this.course_actions.set_activity({ id });
    }
  };

  setAssignmentFilter = (student_id: string, filter: string) => {
    const store = this.get_store();
    if (!store) return;
    let assignmentFilter = store.get("assignmentFilter");
    if (assignmentFilter == null) {
      if (filter) {
        assignmentFilter = iMap({ [student_id]: filter });
        this.course_actions.setState({
          assignmentFilter,
        });
      }
      return;
    }
    assignmentFilter = assignmentFilter.set(student_id, filter);
    this.course_actions.setState({ assignmentFilter });
  };
}
