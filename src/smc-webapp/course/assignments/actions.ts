/*
Actions involving working with assignments:
  - assigning, collecting, setting feedback, etc.
*/

import { CourseActions, PARALLEL_LIMIT } from "../actions";
import { CourseStore, Feedback } from "../store";
import { callback2 } from "smc-util/async-utils";
import { webapp_client } from "../../webapp-client";
import { redux } from "../../app-framework";
import {
  path_split,
  uuid,
  peer_grading,
  mswalltime,
  defaults
} from "smc-util/misc";
import { map } from "awaiting";
import { previous_step, Step, assignment_identifier } from "../util";
import {
  AssignmentCopyType,
  LastAssignmentCopyType,
  SyncDBRecord,
  SyncDBRecordAssignment,
  copy_type_to_last
} from "../types";

export class AssignmentsActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private get_store(): CourseStore {
    return this.course_actions.get_store();
  }

  private collect_path(path: string): string {
    const store = this.get_store();
    if (store == undefined) {
      throw Error("store must be defined");
    }
    const i = store.get("course_filename").lastIndexOf(".");
    return store.get("course_filename").slice(0, i) + "-collect/" + path;
  }

  public add_assignment(path: string): void {
    // Add an assignment to the course, which is defined by giving a directory in the project.
    // Where we collect homework that students have done (in teacher project)
    const collect_path = this.collect_path(path);
    const path_parts = path_split(path);
    // folder that we return graded homework to (in student project)
    const beginning = path_parts.head ? "/graded-" : "graded-";
    const graded_path = path_parts.head + beginning + path_parts.tail;
    // folder where we copy the assignment to
    const target_path = path;

    this.course_actions.set({
      path,
      collect_path,
      graded_path,
      target_path,
      table: "assignments",
      assignment_id: uuid()
    });
  }

  public delete_assignment(assignment_id: string): void {
    return this.course_actions.set({
      deleted: true,
      assignment_id,
      table: "assignments"
    });
  }

  public undelete_assignment(assignment_id: string): void {
    return this.course_actions.set({
      deleted: false,
      assignment_id,
      table: "assignments"
    });
  }

  public clear_edited_feedback(
    assignment_id: string,
    student_id: string
  ): void {
    const store = this.get_store();
    let active_feedback_edits = store.get("active_feedback_edits");
    active_feedback_edits = active_feedback_edits.delete(
      assignment_identifier(assignment_id, student_id)
    );
    this.course_actions.setState({ active_feedback_edits });
  }

  public update_edited_feedback(
    assignment_id: string,
    student_id: string,
    new_edited_grade?: string,
    new_edited_comments?: string
  ) {
    const store = this.get_store();
    const key = assignment_identifier(assignment_id, student_id);
    const current_edited_feedback = store.get("active_feedback_edits").get(key);

    let current_edited_grade: string | undefined;
    let current_edited_comments: string | undefined;

    if (current_edited_feedback) {
      current_edited_grade = current_edited_feedback.get("edited_grade");
      current_edited_comments = current_edited_feedback.get("edited_comments");
    }

    let grade: string;
    if (new_edited_grade != undefined) {
      grade = new_edited_grade;
    } else if (current_edited_grade != undefined) {
      grade = current_edited_grade;
    } else {
      grade = store.get_grade(assignment_id, student_id) || "";
    }

    let comments: string;
    if (new_edited_comments != undefined) {
      comments = new_edited_comments;
    } else if (current_edited_comments != undefined) {
      comments = current_edited_comments;
    } else {
      comments = store.get_comments(assignment_id, student_id) || "";
    }
    const old_edited_feedback = store.get("active_feedback_edits");
    const new_edited_feedback = old_edited_feedback.set(
      key,
      new Feedback({ edited_grade: grade, edited_comments: comments })
    );
    this.course_actions.setState({
      active_feedback_edits: new_edited_feedback
    });
  }

  public save_feedback(assignment_id: string, student_id: string): void {
    const store = this.get_store();
    const active_feedback_edits = store.get("active_feedback_edits");
    if (active_feedback_edits == undefined) {
      return;
    }
    const key = assignment_identifier(assignment_id, student_id);
    const edited_feedback = active_feedback_edits.get(key);
    if (edited_feedback == undefined) {
      return;
    }
    const query = {
      table: "assignments",
      assignment_id
    };
    const assignment_data = this.course_actions.get_one(query);
    if (assignment_data == null) {
      // assignment suddenly doesn't exist...
      return;
    }

    const grades = assignment_data.grades || {};
    grades[student_id] = edited_feedback.get("edited_grade");

    const comments = assignment_data.comments || {};
    comments[student_id] = edited_feedback.get("edited_comments");
    const feedback_changes = Object.assign(
      { grades: grades, comments: comments },
      query
    );
    this.course_actions.set(feedback_changes);
    this.clear_edited_feedback(assignment_id, student_id);
  }

  public set_active_assignment_sort(column_name: string): void {
    let is_descending;
    const store = this.get_store();
    const current_column = store.getIn([
      "active_assignment_sort",
      "column_name"
    ]);
    if (current_column === column_name) {
      is_descending = !store.getIn(["active_assignment_sort", "is_descending"]);
    } else {
      is_descending = false;
    }
    this.course_actions.setState({
      active_assignment_sort: { column_name, is_descending }
    });
  }

  private set_assignment_field(assignment_id: string, name, val): void {
    this.course_actions.set({
      [name]: val,
      table: "assignments",
      assignment_id
    });
  }

  public set_due_date(
    assignment_id: string,
    due_date: Date | string | undefined | null
  ): void {
    if (due_date == null) {
      this.set_assignment_field(assignment_id, "due_date", null);
      return;
    }
    if (typeof due_date !== "string") {
      due_date = due_date.toISOString(); // using strings instead of ms for backward compatibility.
    }
    this.set_assignment_field(assignment_id, "due_date", due_date);
  }

  public set_assignment_note(assignment_id: string, note: string): void {
    this.set_assignment_field(assignment_id, "note", note);
  }

  public set_peer_grade(assignment_id: string, config): void {
    const store = this.get_store();
    const a = store.get_assignment(assignment_id);
    if (a == null) return;
    let cur: any = a.get("peer_grade");
    cur = cur == null ? {} : cur.toJS();
    for (const k in config) {
      const v = config[k];
      cur[k] = v;
    }
    this.set_assignment_field(assignment_id, "peer_grade", cur);
  }

  public set_skip(assignment_id: string, step: string, value: boolean): void {
    this.set_assignment_field(assignment_id, "skip_" + step, value);
  }

  // Synchronous function that makes the peer grading map for the given
  // assignment, if it hasn't already been made.
  private update_peer_assignment(assignment_id: string) {
    const { store, assignment } = this.course_actions.resolve({
      assignment_id
    });
    if (!assignment) return;
    const peers = assignment.getIn(["peer_grade", "map"]);
    if (peers != null) {
      return peers.toJS();
    }
    const N = assignment.getIn(["peer_grade", "number"], 1);
    const map = peer_grading(store.get_student_ids(), N);
    this.set_peer_grade(assignment_id, { map });
    return map;
  }

  // Copy the files for the given assignment_id from the given student to the
  // corresponding collection folder.
  // If the store is initialized and the student and assignment both exist,
  // then calling this action will result in this getting set in the store:
  //
  //    assignment.last_collect[student_id] = {time:?, error:err}
  //
  // where time >= now is the current time in milliseconds.
  private async copy_assignment_from_student(
    assignment_id: string,
    student_id: string
  ): Promise<void> {
    if (this.start_copy(assignment_id, student_id, "last_collect")) {
      return;
    }
    const id = this.course_actions.set_activity({
      desc: "Copying assignment from a student"
    });
    const finish = err => {
      this.course_actions.clear_activity(id);
      this.finish_copy(assignment_id, student_id, "last_collect", err);
      if (err) {
        this.course_actions.set_error(`copy from student: ${err}`);
      }
    };
    const { store, student, assignment } = this.course_actions.resolve({
      assignment_id,
      student_id,
      finish
    });
    if (!student || !assignment) return;
    const student_name = store.get_student_name(student_id);
    const student_project_id = student.get("project_id");
    if (student_project_id == null) {
      // nothing to do
      this.course_actions.clear_activity(id);
      return;
    }
    const target_path =
      assignment.get("collect_path") + "/" + student.get("student_id");
    this.course_actions.set_activity({
      id,
      desc: `Copying assignment from ${student_name}`
    });
    try {
      await callback2(webapp_client.copy_path_between_projects, {
        src_project_id: student_project_id,
        src_path: assignment.get("target_path"),
        target_project_id: store.get("course_project_id"),
        target_path,
        overwrite_newer: true,
        backup: true,
        delete_missing: false,
        exclude_history: false
      });
      // write their name to a file
      const name = store.get_student_name_extra(student_id);
      await this.write_text_file_to_course_project({
        path: target_path + `/STUDENT - ${name.simple}.txt`,
        content: `This student is ${name.full}.`
      });
      finish("");
    } catch (err) {
      finish(err);
    }
  }

  // Copy the graded files for the given assignment_id back to the student in a -graded folder.
  // If the store is initialized and the student and assignment both exist,
  // then calling this action will result in this getting set in the store:
  //
  //    assignment.last_return_graded[student_id] = {time:?, error:err}
  //
  // where time >= now is the current time in milliseconds.

  private async return_assignment_to_student(
    assignment_id: string,
    student_id: string
  ): void {
    if (this.start_copy(assignment_id, student_id, "last_return_graded")) {
      return;
    }
    const id: number = this.course_actions.set_activity({
      desc: "Returning assignment to a student"
    });
    const finish = err => {
      this.course_actions.clear_activity(id);
      this.finish_copy(assignment_id, student_id, "last_return_graded", err);
      if (err) {
        this.course_actions.set_error(`return to student: ${err}`);
      }
    };
    const { store, student, assignment } = this.course_actions.resolve({
      assignment_id,
      student_id,
      finish
    });
    if (!student || !assignment) return;
    const grade = store.get_grade(assignment_id, student_id);
    const comments = store.get_comments(assignment_id, student_id);
    const student_name = store.get_student_name(student_id);
    const student_project_id = student.get("project_id");

    // if skip_grading is true, this means there *might* no be a "grade" given,
    // but instead some grading inside the files or an external tool is used.
    // therefore, only create the grade file if this is false.
    const skip_grading = assignment.get("skip_grading", false);

    if (student_project_id == null) {
      // nothing to do
      this.course_actions.clear_activity(id);
      return;
    }

    let peer_graded;
    this.course_actions.set_activity({
      id,
      desc: `Returning assignment to ${student_name}`
    });
    let src_path = assignment.get("collect_path");
    if (assignment.getIn(["peer_grade", "enabled"])) {
      peer_graded = true;
      src_path += "-peer-grade/";
    } else {
      peer_graded = false;
    }
    src_path += `/${student.get("student_id")}`;
    let content;
    if (skip_grading && !peer_graded) {
      content =
        "Your instructor is doing grading outside CoCalc, or there is no grading for this assignment.";
    } else {
      if (grade != null || peer_graded) {
        content = "Your grade on this assignment:";
      } else {
        content = "";
      }
    }
    // write their grade to a file
    if (grade != null) {
      // likely undefined when skip_grading true & peer_graded true
      content += `\n\n    ${grade}`;
      if (comments != null) {
        content += `\n\nInstructor comments:\n\n${comments}`;
      }
    }
    if (peer_graded) {
      content += `\
\n\n\nPEER GRADED:\n
Your assignment was peer graded by other students.
You can find the comments they made in the folders below.\
`;
    }

    try {
      await this.write_text_file_to_course_project({
        path: src_path + "/GRADE.md",
        content
      });
      await callback2(webapp_client.copy_path_between_projects, {
        src_project_id: store.get("course_project_id"),
        src_path,
        target_project_id: student_project_id,
        target_path: assignment.get("graded_path"),
        overwrite_newer: true,
        backup: true,
        delete_missing: false,
        exclude_history: true
      });
      if (peer_graded) {
        // Delete GRADER file
        await callback2(webapp_client.exec, {
          project_id: student_project_id,
          command: "rm ./*/GRADER*.txt",
          timeout: 60,
          bash: true,
          path: assignment.get("graded_path")
        });
      }
      finish("");
    } catch (err) {
      finish(err);
    }
  }

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  public async return_assignment_to_all_students(
    assignment_id: string,
    new_only: boolean
  ): Promise<void> {
    const id = this.course_actions.set_activity({
      desc:
        "Returning assignments to all students " + new_only
          ? "who have not already received it"
          : ""
    });
    const finish = err => {
      this.course_actions.clear_activity(id);
      this.course_actions.set_error(`return to student: ${err}`);
    };
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
      finish
    });
    if (!assignment) return;
    let errors: string = "";
    const peer: boolean = assignment.getIn(["peer_grade", "enabled"], false);
    const skip_grading: boolean = assignment.get("skip_grading", false);
    async function f(student_id: string): Promise<void> {
      if (this.course_actions.is_closed()) return;
      if (
        !store.last_copied(
          previous_step(Step.return_graded, peer),
          assignment_id,
          student_id,
          true
        )
      ) {
        // we never collected the assignment from this student
        return;
      }
      const has_grade = store.has_grade(assignment_id, student_id);
      if (!skip_grading && !has_grade) {
        // we collected and do grade, but didn't grade it yet
        return;
      }
      if (new_only) {
        if (
          store.last_copied("return_graded", assignment_id, student_id, true) &&
          (skip_grading || has_grade)
        ) {
          // it was already returned
          return;
        }
      }
      try {
        await this.return_assignment_to_student(assignment_id, student_id);
      } catch (err) {
        errors += `\n ${err}`;
      }
    }

    await map(
      store.get_student_ids({ deleted: false }),
      PARALLEL_LIMIT,
      f.bind(this)
    );
    if (errors) {
      finish(errors);
    } else {
      this.course_actions.clear_activity(id);
    }
  }

  private finish_copy(
    assignment_id: string,
    student_id: string,
    type: LastAssignmentCopyType,
    err: any
  ): void {
    const obj: SyncDBRecord = {
      table: "assignments",
      assignment_id
    };
    const a = this.course_actions.get_one(obj);
    if (a == null) return;
    const x = a[type] ? a[type] : {};
    x[student_id] = { time: mswalltime() };
    if (err) {
      x[student_id].error = err;
    }
    obj[type] = x;
    this.course_actions.set(obj);
  }

  // This is called internally before doing any copy/collection operation
  // to ensure that we aren't doing the same thing repeatedly, and that
  // everything is in place to do the operation.
  private start_copy(
    assignment_id: string,
    student_id: string,
    type: LastAssignmentCopyType
  ): boolean {
    const obj: SyncDBRecordAssignment = {
      table: "assignments",
      assignment_id
    };
    const assignment_latest = this.course_actions.get_one(obj);
    if (assignment_latest == null) return false; // assignment gone
    let x = assignment_latest[type];
    if (x == null) x = {};
    let y = x[student_id];
    if (y == null) y = {};
    if (y.start != null && webapp_client.server_time() - y.start <= 15000) {
      return true; // never retry a copy until at least 15 seconds later.
    }
    y.start = mswalltime();
    x[student_id] = y;
    obj[type] = x;
    this.course_actions.set(obj);
    return false;
  }

  private stop_copy(
    assignment_id: string,
    student_id: string,
    type: LastAssignmentCopyType
  ): void {
    const obj: SyncDBRecordAssignment = {
      table: "assignments",
      assignment_id
    };
    const a = this.course_actions.get_one(obj);
    if (a == null) return;
    const x = a[type];
    if (x == null) return;
    const y = x[student_id];
    if (y == null) return;
    if (y.start != null) {
      delete y.start;
      x[student_id] = y;
      obj[type] = x;
      this.course_actions.set(obj);
    }
  }

  // Copy the files for the given assignment to the given student. If
  // the student project doesn't exist yet, it will be created.
  // You may also pass in an id for either the assignment or student.
  // "overwrite" (boolean, optional): if true, the copy operation will overwrite/delete remote files in student projects -- #1483
  // If the store is initialized and the student and assignment both exist,
  // then calling this action will result in this getting set in the store:
  //
  //    assignment.last_assignment[student_id] = {time:?, error:err}
  //
  // where time >= now is the current time in milliseconds.
  private async copy_assignment_to_student(
    assignment_id: string,
    student_id: string,
    opts: object
  ): Promise<void> {
    const { overwrite, create_due_date_file } = defaults(opts, {
      overwrite: false,
      create_due_date_file: false
    });

    if (this.start_copy(assignment_id, student_id, "last_assignment")) {
      return;
    }
    const id = this.course_actions.set_activity({
      desc: "Copying assignment to a student"
    });
    const finish = (err = "") => {
      this.course_actions.clear_activity(id);
      this.finish_copy(assignment_id, student_id, "last_assignment", err);
      if (err) {
        this.course_actions.set_error(`copy to student: ${err}`);
      }
    };

    const { student, assignment, store } = this.course_actions.resolve({
      student_id,
      assignment_id,
      finish
    });
    if (!student || !assignment) return;

    const student_name = store.get_student_name(student_id);
    this.course_actions.set_activity({
      id,
      desc: `Copying assignment to ${student_name}`
    });
    let student_project_id: string | undefined = student.get("project_id");
    const src_path = assignment.get("path");
    try {
      if (student_project_id == null) {
        this.course_actions.set_activity({
          id,
          desc: `${student_name}'s project doesn't exist, so creating it.`
        });
        student_project_id = await this.course_actions.student_projects.create_student_project(
          student_id
        );
        if (!student_project_id) {
          throw Error("failed to create project");
        }
      }
      if (create_due_date_file) {
        await this.copy_assignment_create_due_date_file(assignment_id);
      }
      if (this.course_actions.is_closed()) return;
      this.course_actions.set_activity({
        id,
        desc: `Copying files to ${student_name}'s project`
      });
      await callback2(webapp_client.copy_path_between_projects, {
        src_project_id: store.get("course_project_id"),
        src_path,
        target_project_id: student_project_id,
        target_path: assignment.get("target_path"),
        overwrite_newer: !!overwrite, // default is "false"
        delete_missing: !!overwrite, // default is "false"
        backup: !!!overwrite, // default is "true"
        exclude_history: true
      });

      // successful finish
      finish();
    } catch (err) {
      // error somewhere along the way
      finish(err);
    }
  }

  // this is part of the assignment disribution, should be done only *once*, not for every student
  private async copy_assignment_create_due_date_file(
    assignment_id: string
  ): void {
    const { assignment, store } = this.course_actions.resolve({
      assignment_id
    });
    if (!assignment) return;
    // write the due date to a file
    const due_date = store.get_due_date(assignment_id);
    const src_path = assignment.get("path");
    const due_date_fn = "DUE_DATE.txt";
    if (due_date == null) {
      return;
    }
    const due_id = this.course_actions.set_activity({
      desc: `Creating ${due_date_fn} file...`
    });
    const content = `This assignment is due\n\n   ${due_date.toLocaleString()}`;
    const path = src_path + "/" + due_date_fn;

    try {
      await this.write_text_file_to_course_project({
        path,
        content
      });
    } catch (err) {
      throw Error(
        `Problem writing ${due_date_fn} file ('${err}'). Try again...`
      );
    } finally {
      this.course_actions.clear_activity(due_id);
    }
  }

  public async copy_assignment(
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string
  ): Promise<void> {
    // type = assigned, collected, graded, peer-assigned, peer-collected
    switch (type) {
      case "assigned":
        // create_due_date_file = true
        await this.copy_assignment_to_student(assignment_id, student_id, {
          create_due_date_file: true
        });
        return;
      case "collected":
        await this.copy_assignment_from_student(assignment_id, student_id);
        return;
      case "graded":
        await this.return_assignment_to_student(assignment_id, student_id);
        return;
      case "peer-assigned":
        await this.peer_copy_to_student(assignment_id, student_id);
        return;
      case "peer-collected":
        await this.peer_collect_from_student(assignment_id, student_id);
        return;
      default:
        this.course_actions.set_error(
          `copy_assignment -- unknown type: ${type}`
        );
        return;
    }
  }

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  public async copy_assignment_to_all_students(
    assignment_id: string,
    new_only: boolean,
    overwrite: boolean
  ): Promise<void> {
    const desc = `Copying assignments to all students ${
      new_only ? "who have not already received it" : ""
    }`;
    const short_desc = "copy to student";
    await this.copy_assignment_create_due_date_file(assignment_id);
    // by default, doesn't create the due file
    await this.assignment_action_all_students(
      assignment_id,
      new_only,
      this.copy_assignment_to_student,
      "assignment",
      desc,
      short_desc,
      overwrite
    );
  }

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  public async copy_assignment_from_all_students(
    assignment_id: string,
    new_only: boolean
  ): Promise<void> {
    let desc = "Copying assignment from all students";
    if (new_only) {
      desc += " from whom we have not already copied it";
    }
    const short_desc = "copy from student";
    await this.assignment_action_all_students(
      assignment_id,
      new_only,
      this.copy_assignment_from_student,
      "collect",
      desc,
      short_desc
    );
  }

  public async peer_copy_to_all_students(
    assignment_id: string,
    new_only: boolean
  ): Promise<void> {
    let desc = "Copying assignments for peer grading to all students ";
    if (new_only) {
      desc += " who have not already received their copy";
    }
    const short_desc = "copy to student for peer grading";
    await this.assignment_action_all_students(
      assignment_id,
      new_only,
      this.peer_copy_to_student,
      "peer_assignment",
      desc,
      short_desc
    );
  }

  public async peer_collect_from_all_students(
    assignment_id: string,
    new_only: boolean
  ): Promise<void> {
    let desc = "Copying peer graded assignments from all students";
    if (new_only) {
      desc += " from whom we have not already copied it";
    }
    const short_desc = "copy peer grading from students";
    await this.assignment_action_all_students(
      assignment_id,
      new_only,
      this.peer_collect_from_student,
      "peer_collect",
      desc,
      short_desc
    );
  }

  private async assignment_action_all_students(
    assignment_id: string,
    new_only: boolean,
    action: (
      assignment_id: string,
      student_id: string,
      opts: any
    ) => Promise<void>,
    step,
    desc,
    short_desc: string,
    overwrite?: boolean
  ): Promise<void> {
    const id = this.course_actions.set_activity({ desc });
    const finish = err => {
      this.course_actions.clear_activity(id);
      err = `${short_desc}: ${err}`;
      this.course_actions.set_error(err);
    };
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
      finish
    });
    if (!assignment) return;
    let errors = "";
    const peer: boolean = assignment.getIn(["peer_grade", "enabled"], false);
    const prev_step =
      step == Step.assignment ? undefined : previous_step(step, peer);
    const f = async (student_id: string): Promise<void> => {
      if (this.course_actions.is_closed()) return;
      const store = this.get_store();
      if (
        prev_step != null &&
        !store.last_copied(prev_step, assignment_id, student_id, true)
      ) {
        return;
      }
      if (
        new_only &&
        store.last_copied(step, assignment_id, student_id, true)
      ) {
        return;
      }
      try {
        await action.bind(this)(assignment_id, student_id, { overwrite });
      } catch (err) {
        errors += `\n ${err}`;
      }
    };

    await map(store.get_student_ids({ deleted: false }), PARALLEL_LIMIT, f);

    if (errors) {
      finish(errors);
    } else {
      this.course_actions.clear_activity(id);
    }
  }

  // Copy the collected folders from some students to the given student for peer grading.
  // Assumes folder is non-empty
  private async peer_copy_to_student(
    assignment_id: string,
    student_id: string
  ): Promise<void> {
    if (this.start_copy(assignment_id, student_id, "last_peer_assignment")) {
      return;
    }
    const id = this.course_actions.set_activity({
      desc: "Copying peer grading to a student"
    });
    const finish = (err?) => {
      this.course_actions.clear_activity(id);
      this.finish_copy(assignment_id, student_id, "last_peer_assignment", err);
      if (err) {
        this.course_actions.set_error(`copy peer-grading to student: ${err}`);
      }
    };
    const { store, student, assignment } = this.course_actions.resolve({
      assignment_id,
      student_id,
      finish
    });
    if (!student || !assignment) return;

    const student_name = store.get_student_name(student_id);
    this.course_actions.set_activity({
      id,
      desc: `Copying peer grading to ${student_name}`
    });

    const peer_map = this.update_peer_assignment(assignment_id); // synchronous

    if (peer_map == null) {
      finish();
      return;
    }

    const peers = peer_map[student.get("student_id")];
    if (peers == null) {
      // empty peer assignment for this student (maybe student added after peer assignment already created?)
      finish();
      return;
    }

    const student_project_id = student.get("project_id");

    let guidelines: string = assignment.getIn(
      ["peer_grade", "guidelines"],
      "Please grade this assignment."
    );
    const due_date = assignment.getIn(["peer_grade", "due_date"]);
    if (due_date != null) {
      guidelines =
        `GRADING IS DUE ${new Date(due_date).toLocaleString()} \n\n ` +
        guidelines;
    }

    const peer_grading_guidelines_file =
      assignment.get("collect_path") + "/GRADING-GUIDE.md";

    const target_base_path = assignment.get("path") + "-peer-grade";
    const f = async (student_id: string): Promise<void> => {
      if (this.course_actions.is_closed()) return;
      const src_path = assignment.get("collect_path") + "/" + student_id;
      const target_path = target_base_path + "/" + student_id;
      // delete the student's name so that grading is anonymous; also, remove original
      // due date to avoid confusion.
      const name = store.get_student_name_extra(student_id);
      await callback2(webapp_client.exec, {
        project_id: store.get("course_project_id"),
        command: "rm",
        args: [
          "-f",
          src_path + `/STUDENT - ${name.simple}.txt`,
          src_path + "/DUE_DATE.txt",
          src_path + `/STUDENT - ${name.simple}.txt~`,
          src_path + "/DUE_DATE.txt~"
        ]
      });
      if (this.course_actions.is_closed()) return;

      // copy the files to be peer graded into place for this student
      await callback2(webapp_client.copy_path_between_projects, {
        src_project_id: store.get("course_project_id"),
        src_path,
        target_project_id: student_project_id,
        target_path,
        overwrite_newer: false,
        delete_missing: false
      });
    };

    try {
      // write instructions file to the student
      await this.write_text_file_to_course_project({
        path: peer_grading_guidelines_file,
        content: guidelines
      });
      // copy it over
      await callback2(webapp_client.copy_path_between_projects, {
        src_project_id: store.get("course_project_id"),
        src_path: peer_grading_guidelines_file,
        target_project_id: student_project_id,
        target_path: target_base_path + "/GRADING-GUIDE.md"
      });
      // now copy actual stuff to grade
      await map(peers, PARALLEL_LIMIT, f);
      finish();
    } catch (err) {
      finish(err);
      return;
    }
  }

  // Collect all the peer graading of the given student (not the work the student did, but
  // the grading about the student!).
  private async peer_collect_from_student(
    assignment_id: string,
    student_id: string
  ): Promise<void> {
    if (this.start_copy(assignment_id, student_id, "last_peer_collect")) {
      return;
    }
    const id = this.course_actions.set_activity({
      desc: "Collecting peer grading of a student"
    });
    const finish = (err?) => {
      this.course_actions.clear_activity(id);
      this.finish_copy(assignment_id, student_id, "last_peer_collect", err);
      if (err) {
        this.course_actions.set_error(
          `collecting peer-grading of a student: ${err}`
        );
      }
    };

    const { store, student, assignment } = this.course_actions.resolve({
      student_id,
      assignment_id,
      finish
    });
    if (!student || !assignment) return;

    const student_name = store.get_student_name(student_id);
    this.course_actions.set_activity({
      id,
      desc: `Collecting peer grading of ${student_name}`
    });

    // list of student_id of students that graded this student (may be empty)
    const peers: string[] = store.get_peers_that_graded_student(
      assignment_id,
      student_id
    );

    const our_student_id = student.get("student_id");

    const f = async (student_id: string): Promise<void> => {
      const s = store.get_student(student_id);
      // ignore deleted or non-existent students
      if (s == null || s.get("deleted")) return;

      const path = assignment.get("path");
      const src_path = `${path}-peer-grade/${our_student_id}`;
      const target_path = `${assignment.get(
        "collect_path"
      )}-peer-grade/${our_student_id}/${student_id}`;

      // copy the files over from the student who did the peer grading
      await callback2(webapp_client.copy_path_between_projects, {
        src_project_id: s.get("project_id"),
        src_path,
        target_project_id: store.get("course_project_id"),
        target_path,
        overwrite_newer: false,
        delete_missing: false
      });

      // write local file identifying the grader
      let name = store.get_student_name_extra(student_id);
      await this.write_text_file_to_course_project({
        path: target_path + `/GRADER - ${name.simple}.txt`,
        content: `The student who did the peer grading is named ${name.full}.`
      });

      // write local file identifying student being graded
      name = store.get_student_name_extra(student_id);
      await this.write_text_file_to_course_project({
        path: target_path + `/STUDENT - ${name.simple}.txt`,
        content: `This student is ${name.full}.`
      });
    };

    try {
      await map(peers, PARALLEL_LIMIT, f);
      finish();
    } catch (err) {
      finish(err);
    }
  }

  // This doesn't really stop it yet, since that's not supported by the backend.
  // It does stop the spinner and let the user try to restart the copy.
  public stop_copying_assignment(
    assignment_id: string,
    student_id: string,
    type: AssignmentCopyType
  ): void {
    this.stop_copy(assignment_id, student_id, copy_type_to_last(type));
  }

  public open_assignment(
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string
  ): void {
    const { store, assignment, student } = this.course_actions.resolve({
      assignment_id,
      student_id
    });
    if (store == null || assignment == null || student == null) return;
    const student_project_id = student.get("project_id");
    if (student_project_id == null) {
      this.course_actions.set_error(
        "open_assignment: student project not yet created"
      );
      return;
    }
    // Figure out what to open
    let path, proj;
    switch (type) {
      case "assigned": // where project was copied in the student's project.
        path = assignment.get("target_path");
        proj = student_project_id;
        break;
      case "collected": // where collected locally
        path = assignment.get("collect_path") + "/" + student.get("student_id"); // TODO: refactor
        proj = store.get("course_project_id");
        break;
      case "peer-assigned": // where peer-assigned (in student's project)
        proj = student_project_id;
        path = assignment.get("path") + "-peer-grade";
        break;
      case "peer-collected": // where collected peer-graded work (in our project)
        path =
          assignment.get("collect_path") +
          "-peer-grade/" +
          student.get("student_id");
        proj = store.get("course_project_id");
        break;
      case "graded": // where project returned
        path = assignment.get("graded_path"); // refactor
        proj = student_project_id;
        break;
      default:
        this.course_actions.set_error(
          `open_assignment -- unknown type: ${type}`
        );
    }
    if (proj == null) {
      this.course_actions.set_error("no such project");
      return;
    }
    // Now open it
    redux.getProjectActions(proj).open_directory(path);
  }

  private async write_text_file_to_course_project(opts: {
    path: string;
    content: string;
  }): Promise<void> {
    await callback2(webapp_client.write_text_file_to_project, {
      project_id: this.get_store().get("course_project_id"),
      path: opts.path,
      content: opts.content
    });
  }
}
