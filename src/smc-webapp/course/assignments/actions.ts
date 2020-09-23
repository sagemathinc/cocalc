/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Actions involving working with assignments:
  - assigning, collecting, setting feedback, etc.
*/

export const STUDENT_SUBDIR = "student";

// default timeout of 1 minute per cell
export const NBGRADER_CELL_TIMEOUT_MS: number = 60 * 1000;

// default timeout of 10 minutes for whole notebooks
export const NBGRADER_TIMEOUT_MS: number = 10 * 60 * 1000;

import { Map } from "immutable";

import { CourseActions, PARALLEL_LIMIT } from "../actions";
import {
  AssignmentRecord,
  CourseStore,
  Feedback,
  NBgraderRunInfo,
  get_nbgrader_score,
} from "../store";
import { start_project, exec } from "../../frame-editors/generic/client";
import { webapp_client } from "../../webapp-client";
import { redux } from "../../app-framework";
import {
  len,
  path_split,
  uuid,
  peer_grading,
  mswalltime,
  defaults,
  split,
  trunc,
} from "smc-util/misc";
import { map } from "awaiting";

import { nbgrader, jupyter_strip_notebook } from "../../jupyter/nbgrader/api";
import { grading_state } from "../nbgrader/util";
import { ipynb_clear_hidden_tests } from "../../jupyter/nbgrader/clear-hidden-tests";
import {
  extract_auto_scores,
  NotebookScores,
} from "../../jupyter/nbgrader/autograde";

import {
  previous_step,
  assignment_identifier,
  autograded_filename,
} from "../util";
import {
  AssignmentCopyType,
  LastAssignmentCopyType,
  SyncDBRecord,
  SyncDBRecordAssignment,
  copy_type_to_last,
} from "../types";

import { export_student_file_use_times } from "../export/file-use-times";

import { export_assignment } from "../export/export-assignment";

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

  public async add_assignment(path: string): Promise<void> {
    // Add an assignment to the course, which is defined by giving a directory in the project.
    // Where we collect homework that students have done (in teacher project)
    const collect_path = this.collect_path(path);
    const path_parts = path_split(path);
    // folder that we return graded homework to (in student project)
    const beginning = path_parts.head ? "/graded-" : "graded-";
    const graded_path = path_parts.head + beginning + path_parts.tail;
    // folder where we copy the assignment to
    const target_path = path;

    try {
      // Ensure the path actually exists.
      await exec({
        project_id: this.get_store().get("course_project_id"),
        command: "mkdir",
        args: ["-p", path],
        err_on_exit: true,
      });
    } catch (err) {
      this.course_actions.set_error(`error creating assignment: ${err}`);
      return;
    }
    this.course_actions.set({
      path,
      collect_path,
      graded_path,
      target_path,
      table: "assignments",
      assignment_id: uuid(),
    });
  }

  public delete_assignment(assignment_id: string): void {
    this.course_actions.set({
      deleted: true,
      assignment_id,
      table: "assignments",
    });
  }

  public undelete_assignment(assignment_id: string): void {
    this.course_actions.set({
      deleted: false,
      assignment_id,
      table: "assignments",
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
      active_feedback_edits: new_edited_feedback,
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
      assignment_id,
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
    const feedback_changes = Object.assign({ grades, comments }, query);
    this.course_actions.set(feedback_changes);
    this.clear_edited_feedback(assignment_id, student_id);
  }

  // Set a specific grade for a student in an assignment.
  // This overlaps with save_feedback, but is more
  // direct and uses that maybe the user isn't manually editing
  // this.  E.g., nbgrader uses this to automatically set the grade.
  public set_grade(
    assignment_id: string,
    student_id: string,
    grade: string,
    commit: boolean = true
  ): void {
    const { assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) {
      throw Error("no such assignment");
    }
    // Annoying that we have to convert to JS here and cast,
    // but the set below seems to require it.
    let grades = assignment.get("grades", Map()).toJS() as {
      [student_id: string]: string;
    };
    grades[student_id] = grade;
    this.course_actions.set(
      {
        table: "assignments",
        assignment_id,
        grades,
      },
      commit
    );
  }

  public set_active_assignment_sort(column_name: string): void {
    let is_descending;
    const store = this.get_store();
    const current_column = store.getIn([
      "active_assignment_sort",
      "column_name",
    ]);
    if (current_column === column_name) {
      is_descending = !store.getIn(["active_assignment_sort", "is_descending"]);
    } else {
      is_descending = false;
    }
    this.course_actions.setState({
      active_assignment_sort: { column_name, is_descending },
    });
  }

  private set_assignment_field(assignment_id: string, name: string, val): void {
    this.course_actions.set({
      [name]: val,
      table: "assignments",
      assignment_id,
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
      assignment_id,
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
      desc: "Copying assignment from a student",
    });
    const finish = (err) => {
      this.course_actions.clear_activity(id);
      this.finish_copy(assignment_id, student_id, "last_collect", err);
      if (err) {
        this.course_actions.set_error(`copy from student: ${err}`);
      }
    };
    const { store, student, assignment } = this.course_actions.resolve({
      assignment_id,
      student_id,
      finish,
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
      desc: `Copying assignment from ${student_name}`,
    });
    try {
      await webapp_client.project_client.copy_path_between_projects({
        src_project_id: student_project_id,
        src_path: assignment.get("target_path"),
        target_project_id: store.get("course_project_id"),
        target_path,
        overwrite_newer: true,
        backup: true,
        delete_missing: false,
      });
      // write their name to a file
      const name = store.get_student_name_extra(student_id);
      await this.write_text_file_to_course_project({
        path: target_path + `/STUDENT - ${name.simple}.txt`,
        content: `This student is ${name.full}.`,
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
  ): Promise<void> {
    if (this.start_copy(assignment_id, student_id, "last_return_graded")) {
      return;
    }
    const id: number = this.course_actions.set_activity({
      desc: "Returning assignment to a student",
    });
    const finish = (err) => {
      this.course_actions.clear_activity(id);
      this.finish_copy(assignment_id, student_id, "last_return_graded", err);
      if (err) {
        this.course_actions.set_error(`return to student: ${err}`);
      }
    };
    const { store, student, assignment } = this.course_actions.resolve({
      assignment_id,
      student_id,
      finish,
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
      desc: `Returning assignment to ${student_name}`,
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
      if (grade || peer_graded) {
        content = "# Your grade";
      } else {
        content = "";
      }
    }
    // write their grade to a file
    if (grade) {
      // likely undefined when skip_grading true & peer_graded true
      content += `\n\n${grade}`;
    }
    if (comments != null && comments.trim().length > 0) {
      content += `\n\n# Instructor comments\n\n${comments}`;
    }
    if (peer_graded) {
      content += `\
\n\n\n# Peer graded\n\n
Your assignment was peer graded by other students.
You can find the comments they made in the folders below.\
`;
    }

    const nbgrader_scores = store.get_nbgrader_scores(
      assignment_id,
      student_id
    );
    if (nbgrader_scores) {
      const { score, points, error } = get_nbgrader_score(nbgrader_scores);
      const summary = error ? "error" : `${score}/${points}`;

      let details: string = "";
      for (const filename in nbgrader_scores) {
        details += `\n\n**${filename}:**\n\n`;
        const s = nbgrader_scores[filename];
        if (typeof s == "string") {
          details += `ERROR: ${s}\n\n`;
        } else {
          details += `| Problem   | Score     |\n|:----------|:----------|\n`;
          for (const id in s) {
            const t = `${s[id].score}`;
            details += `| ${id.padEnd(10)}| ${t.padEnd(10)}|\n`;
          }
        }
      }

      // TODO: make this nicer, especially the details.
      content += `\
\n\n# nbgrader\n
Your notebook was automatically graded using nbgrader, with
possible additional instructor tests.

TOTAL SCORE: ${summary}

## nbgrader details
${details}
`;
    }

    try {
      await this.write_text_file_to_course_project({
        path: src_path + "/GRADE.md",
        content,
      });
      await webapp_client.project_client.copy_path_between_projects({
        src_project_id: store.get("course_project_id"),
        src_path,
        target_project_id: student_project_id,
        target_path: assignment.get("graded_path"),
        overwrite_newer: true,
        backup: true,
        delete_missing: false,
      });
      if (peer_graded) {
        // Delete GRADER file
        await webapp_client.project_client.exec({
          project_id: student_project_id,
          command: "rm ./*/GRADER*.txt",
          timeout: 60,
          bash: true,
          path: assignment.get("graded_path"),
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
          : "",
    });
    const finish = (err) => {
      this.course_actions.clear_activity(id);
      this.course_actions.set_error(`return to student: ${err}`);
    };
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
      finish,
    });
    if (!assignment) return;
    let errors: string = "";
    const peer: boolean = assignment.getIn(["peer_grade", "enabled"], false);
    const skip_grading: boolean = assignment.get("skip_grading", false);
    const f: (student_id: string) => Promise<void> = async (student_id) => {
      if (this.course_actions.is_closed()) return;
      if (
        !store.last_copied(
          previous_step("return_graded", peer),
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
    };

    await map(store.get_student_ids({ deleted: false }), PARALLEL_LIMIT, f);
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
      assignment_id,
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
      assignment_id,
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
      assignment_id,
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
      create_due_date_file: false,
    });

    if (this.start_copy(assignment_id, student_id, "last_assignment")) {
      return;
    }
    const id = this.course_actions.set_activity({
      desc: "Copying assignment to a student",
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
      finish,
    });
    if (!student || !assignment) return;

    const student_name = store.get_student_name(student_id);
    this.course_actions.set_activity({
      id,
      desc: `Copying assignment to ${student_name}`,
    });
    let student_project_id: string | undefined = student.get("project_id");
    const src_path = this.assignment_src_path(assignment);
    try {
      if (student_project_id == null) {
        this.course_actions.set_activity({
          id,
          desc: `${student_name}'s project doesn't exist, so creating it.`,
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
        desc: `Copying files to ${student_name}'s project`,
      });
      await webapp_client.project_client.copy_path_between_projects({
        src_project_id: store.get("course_project_id"),
        src_path,
        target_project_id: student_project_id,
        target_path: assignment.get("target_path"),
        overwrite_newer: !!overwrite, // default is "false"
        delete_missing: !!overwrite, // default is "false"
        backup: !!!overwrite, // default is "true"
      });

      // successful finish
      finish();
    } catch (err) {
      // error somewhere along the way
      finish(err);
    }
  }

  private assignment_src_path(assignment): string {
    let path = assignment.get("path");
    if (assignment.get("has_student_subdir")) {
      path += "/" + STUDENT_SUBDIR;
    }
    return path;
  }

  // this is part of the assignment disribution, should be done only *once*, not for every student
  private async copy_assignment_create_due_date_file(
    assignment_id: string
  ): Promise<void> {
    const { assignment, store } = this.course_actions.resolve({
      assignment_id,
    });
    if (!assignment) return;
    // write the due date to a file
    const due_date = store.get_due_date(assignment_id);
    const src_path = this.assignment_src_path(assignment);
    const due_date_fn = "DUE_DATE.txt";
    if (due_date == null) {
      return;
    }
    const due_id = this.course_actions.set_activity({
      desc: `Creating ${due_date_fn} file...`,
    });
    const content = `This assignment is due\n\n   ${due_date.toLocaleString()}`;
    const path = src_path + "/" + due_date_fn;

    try {
      await this.write_text_file_to_course_project({
        path,
        content,
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
        // make sure listing is up to date, since it sets "has_student_subdir",
        // which impacts the distribute semantics.
        await this.update_listing(assignment_id);
        await this.copy_assignment_to_student(assignment_id, student_id, {
          create_due_date_file: true,
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
    await this.update_listing(assignment_id); // make sure this is up to date
    if (this.course_actions.is_closed()) return;
    await this.copy_assignment_create_due_date_file(assignment_id);
    if (this.course_actions.is_closed()) return;
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

  // Copy the given assignment to from all non-deleted students, doing several copies in parallel at once.
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
    // CRITICAL: be sure to run this update once before doing the
    // assignment.  Otherwise, since assignment runs more than once
    // in parallel, two will launch at about the same time and
    // the *condition* to know if it is done depends on the store,
    // which defers when it gets updated.  Anyway, this line is critical:
    this.update_peer_assignment(assignment_id);
    // OK, now do the assignment... in parallel.
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
    const finish = (err) => {
      this.course_actions.clear_activity(id);
      err = `${short_desc}: ${err}`;
      this.course_actions.set_error(err);
    };
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
      finish,
    });
    if (!assignment) return;
    let errors = "";
    const peer: boolean = assignment.getIn(["peer_grade", "enabled"], false);
    const prev_step =
      step == "assignment" ? undefined : previous_step(step, peer);
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
      desc: "Copying peer grading to a student",
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
      finish,
    });
    if (!student || !assignment) return;

    const student_name = store.get_student_name(student_id);
    this.course_actions.set_activity({
      id,
      desc: `Copying peer grading to ${student_name}`,
    });

    const peer_map = this.update_peer_assignment(assignment_id); // synchronous

    if (peer_map == null) {
      finish();
      return;
    }

    const peers = peer_map[student.get("student_id")];
    if (peers == null) {
      // empty peer assignment for this student (maybe student added after
      // peer assignment already created?)
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
    const f = async (peer_student_id: string) => {
      if (this.course_actions.is_closed()) return;
      const src_path = assignment.get("collect_path") + "/" + peer_student_id;
      const target_path = target_base_path + "/" + peer_student_id;
      // delete the student's name so that grading is anonymous; also, remove original
      // due date to avoid confusion.
      const name = store.get_student_name_extra(peer_student_id);
      await webapp_client.project_client.exec({
        project_id: store.get("course_project_id"),
        command: "rm",
        args: [
          "-f",
          src_path + `/STUDENT - ${name.simple}.txt`,
          src_path + "/DUE_DATE.txt",
          src_path + `/STUDENT - ${name.simple}.txt~`,
          src_path + "/DUE_DATE.txt~",
        ],
      });
      if (this.course_actions.is_closed()) return;

      // copy the files to be peer graded into place for this student
      await webapp_client.project_client.copy_path_between_projects({
        src_project_id: store.get("course_project_id"),
        src_path,
        target_project_id: student_project_id,
        target_path,
        overwrite_newer: false,
        delete_missing: false,
      });
    };

    try {
      // write instructions file to the student
      await this.write_text_file_to_course_project({
        path: peer_grading_guidelines_file,
        content: guidelines,
      });
      // copy it over
      await webapp_client.project_client.copy_path_between_projects({
        src_project_id: store.get("course_project_id"),
        src_path: peer_grading_guidelines_file,
        target_project_id: student_project_id,
        target_path: target_base_path + "/GRADING-GUIDE.md",
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
      desc: "Collecting peer grading of a student",
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
      finish,
    });
    if (!student || !assignment) return;

    const student_name = store.get_student_name(student_id);
    this.course_actions.set_activity({
      id,
      desc: `Collecting peer grading of ${student_name}`,
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
      await webapp_client.project_client.copy_path_between_projects({
        src_project_id: s.get("project_id"),
        src_path,
        target_project_id: store.get("course_project_id"),
        target_path,
        overwrite_newer: false,
        delete_missing: false,
      });

      // write local file identifying the grader
      let name = store.get_student_name_extra(student_id);
      await this.write_text_file_to_course_project({
        path: target_path + `/GRADER - ${name.simple}.txt`,
        content: `The student who did the peer grading is named ${name.full}.`,
      });

      // write local file identifying student being graded
      name = store.get_student_name_extra(our_student_id);
      await this.write_text_file_to_course_project({
        path: target_path + `/STUDENT - ${name.simple}.txt`,
        content: `This student is ${name.full}.`,
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
      student_id,
    });
    if (assignment == null || student == null) return;
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
    await webapp_client.project_client.write_text_file({
      project_id: this.get_store().get("course_project_id"),
      path: opts.path,
      content: opts.content,
    });
  }

  // Update datastore with directory listing of non-hidden content of the assignment.
  // This also sets whether or not there is a STUDENT_SUBDIR directory.
  public async update_listing(assignment_id: string): Promise<void> {
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) return;
    const project_id = store.get("course_project_id");
    const path = assignment.get("path");
    if (project_id == null || path == null) return;
    let listing;
    try {
      const { files } = await webapp_client.project_client.directory_listing({
        project_id,
        path,
        hidden: false,
      });
      listing = files;
    } catch (err) {
      // This might happen, e.g., if the assignment directory is deleted or user messes
      // with permissions...
      // In this case, just give up.
      return;
    }
    if (listing == null || this.course_actions.is_closed()) return;
    this.course_actions.set({
      listing,
      assignment_id,
      table: "assignments",
    });

    let has_student_subdir: boolean = false;
    for (const entry of listing) {
      if (entry.isdir && entry.name == STUDENT_SUBDIR) {
        has_student_subdir = true;
        break;
      }
    }
    const nbgrader = has_student_subdir
      ? await this.probably_uses_nbgrader(assignment, project_id)
      : false;
    if (this.course_actions.is_closed()) return;
    this.course_actions.set({
      has_student_subdir,
      nbgrader,
      assignment_id,
      table: "assignments",
    });
  }

  private async probably_uses_nbgrader(
    assignment: AssignmentRecord,
    project_id: string
  ): Promise<boolean> {
    // Heuristic: we check if there is an ipynb file in the STUDENT_SUBDIR
    // that contains "nbgrader".
    const path = this.assignment_src_path(assignment);
    const command = "grep nbgrader *.ipynb | wc -l";
    const cnt = parseInt(
      (
        await exec({
          project_id,
          command,
          path,
          err_on_exit: true,
        })
      ).stdout
    );
    return cnt > 0;
  }

  // Read in the (stripped) contents of all nbgrader instructor ipynb
  // files for this assignment.  These are:
  //  - Nothing if has_student_subdir isn't set.
  //  - Every ipynb in the assignment directory that contains
  //    the string 'nbgrader'.
  //  - Exception if any ipynb file that is mangled, i.e., JSON.parse fails...
  public async nbgrader_instructor_ipynb_files(
    assignment_id: string
  ): Promise<{ [path: string]: string }> {
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null || !assignment.get("has_student_subdir")) {
      return {}; // nothing case.
    }
    const path = assignment.get("path");
    const project_id = store.get("course_project_id");
    const command = "ls";
    // The F options make it so we won't get tricked by a directory
    // whose name ends in .ipynb
    const args = ["--color=never", "-1F"];
    const files: string[] = (
      await exec({
        project_id,
        path,
        command,
        args,
      })
    ).stdout.split("\n");

    const to_read: string[] = [];
    for (const file of files) {
      if (file.endsWith(".ipynb")) {
        to_read.push(file);
      }
    }

    const result: { [path: string]: string } = {};

    const f: (file: string) => Promise<void> = async (file) => {
      if (this.course_actions.is_closed()) return;
      const fullpath = path != "" ? path + "/" + file : file;
      const content = await jupyter_strip_notebook(project_id, fullpath);
      if (content.indexOf("nbgrader") != -1) {
        result[file] = content;
      }
    };

    await map(to_read, PARALLEL_LIMIT, f);
    return result;
  }

  // Run nbgrader for all students for which this assignment
  // has been collected at least once.
  public async run_nbgrader_for_all_students(
    assignment_id: string,
    ungraded_only?: boolean
  ): Promise<void> {
    // console.log("run_nbgrader_for_all_students", assignment_id);
    const instructor_ipynb_files = await this.nbgrader_instructor_ipynb_files(
      assignment_id
    );
    if (this.course_actions.is_closed()) return;
    const store = this.get_store();
    const nbgrader_scores = store.getIn([
      "assignments",
      assignment_id,
      "nbgrader_scores",
    ]);
    const one_student: (student_id: string) => Promise<void> = async (
      student_id
    ) => {
      if (this.course_actions.is_closed()) return;
      if (!store.last_copied("collect", assignment_id, student_id, true)) {
        // Do not try to grade the assignment, since it wasn't
        // already successfully collected yet.
        return;
      }
      if (
        ungraded_only &&
        grading_state(student_id, nbgrader_scores) == "succeeded"
      ) {
        // Do not try to grade assignment, if it has already been successfully graded.
        return;
      }
      await this.run_nbgrader_for_one_student(
        assignment_id,
        student_id,
        instructor_ipynb_files,
        true
      );
    };
    try {
      this.nbgrader_set_is_running(assignment_id);
      await map(
        this.get_store().get_student_ids({ deleted: false }),
        1, // TODO: not actually in parallel for now; I had trouble with it in parallel
        one_student
      );
      this.course_actions.syncdb.commit();
    } finally {
      this.nbgrader_set_is_done(assignment_id);
    }
  }

  public set_nbgrader_scores_for_one_student(
    assignment_id: string,
    student_id: string,
    scores: { [filename: string]: NotebookScores | string },
    commit: boolean = true
  ): void {
    const assignment_data = this.course_actions.get_one({
      table: "assignments",
      assignment_id,
    });
    if (assignment_data == null) return;
    const nbgrader_scores: {
      [student_id: string]: { [ipynb: string]: NotebookScores | string };
    } = assignment_data.nbgrader_scores || {};
    nbgrader_scores[student_id] = scores;
    this.course_actions.set(
      {
        table: "assignments",
        assignment_id,
        nbgrader_scores,
      },
      commit
    );
    this.set_grade_using_nbgrader_if_possible(
      assignment_id,
      student_id,
      commit
    );
  }

  public set_specific_nbgrader_score(
    assignment_id: string,
    student_id: string,
    filename: string,
    grade_id: string,
    score: number,
    commit: boolean = true
  ): void {
    const { assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) {
      throw Error("no such assignment");
    }

    const scores: any = assignment
      .getIn(["nbgrader_scores", student_id], Map())
      .toJS();
    let x: any = scores[filename];
    if (x == null) {
      x = scores[filename] = {};
    }
    let y = x[grade_id];
    if (y == null) {
      y = x[grade_id] = {};
    }
    y.score = score;
    if (y.points != null && y.score > y.points) {
      y.score = y.points;
    }
    if (y.score < 0) {
      y.score = 0;
    }
    this.set_nbgrader_scores_for_one_student(
      assignment_id,
      student_id,
      scores,
      commit
    );

    this.set_grade_using_nbgrader_if_possible(
      assignment_id,
      student_id,
      commit
    );
  }

  // Fill in manual grade if it is blank and there is an nbgrader grade
  // and all the manual nbgrader scores have been filled in.
  // Also, the filled in grade uses a specific format [number]/[total]
  // and if this is maintained and the nbgrader scores change, this
  // the manual grade is updated.
  public set_grade_using_nbgrader_if_possible(
    assignment_id: string,
    student_id: string,
    commit: boolean = true
  ): void {
    // Check if nbgrader scores are all available.
    const store = this.get_store();
    const scores = store.get_nbgrader_scores(assignment_id, student_id);
    if (scores == null) {
      // no info -- maybe nbgrader not even run yet.
      return;
    }
    const { score, points, error, manual_needed } = get_nbgrader_score(scores);
    if (error || manual_needed) {
      // more work must be done before we can use this.
      return;
    }

    // Fill in the overall grade if either it is currently unset, blank,
    // or of the form [number]/[number].
    const grade = store.get_grade(assignment_id, student_id).trim();
    if (grade == "" || grade.match(/\d+\/\d+/g)) {
      this.set_grade(assignment_id, student_id, `${score}/${points}`, commit);
    }
  }

  public async run_nbgrader_for_one_student(
    assignment_id: string,
    student_id: string,
    instructor_ipynb_files?: { [path: string]: string },
    commit: boolean = true
  ): Promise<void> {
    // console.log("run_nbgrader_for_one_student", assignment_id, student_id);

    const { store, assignment, student } = this.course_actions.resolve({
      assignment_id,
      student_id,
    });

    if (
      student == null ||
      assignment == null ||
      !assignment.get("has_student_subdir")
    ) {
      return; // nothing case.
    }

    const nbgrader_grade_project: string | undefined = store.getIn([
      "settings",
      "nbgrader_grade_project",
    ]);

    const nbgrader_include_hidden_tests: boolean = !!store.getIn([
      "settings",
      "nbgrader_include_hidden_tests",
    ]);

    const course_project_id = store.get("course_project_id");

    let grade_project_id: string;
    if (nbgrader_grade_project) {
      grade_project_id = nbgrader_grade_project;
    } else {
      const student_project_id = student.get("project_id");
      if (student_project_id == null) {
        // This would happen if maybe instructor deletes student project at
        // the exact wrong time.
        // TODO: just create a new project for them?
        throw Error("student has no project, so can't run nbgrader");
      }
      grade_project_id = student_project_id;
    }
    const where_grade =
      redux.getStore("projects").get_title(grade_project_id) ?? "a project";

    if (instructor_ipynb_files == null) {
      instructor_ipynb_files = await this.nbgrader_instructor_ipynb_files(
        assignment_id
      );
      if (this.course_actions.is_closed()) return;
    }
    if (len(instructor_ipynb_files) == 0) {
      /* console.log(
        "run_nbgrader_for_one_student",
        assignment_id,
        student_id,
        "done -- no ipynb files"
      ); */
      return; // nothing to do
    }

    const student_path = assignment.get("target_path");
    const result: { [path: string]: any } = {};
    const scores: { [filename: string]: NotebookScores | string } = {};

    const one_file: (file: string) => Promise<void> = async (file) => {
      const activity_id = this.course_actions.set_activity({
        desc: `Running nbgrader on ${store.get_student_name(
          student_id
        )}'s "${file}" in '${trunc(where_grade, 40)}'`,
      });
      if (assignment == null || student == null) {
        // This won't happen, but it makes Typescript happy.
        return;
      }
      try {
        const fullpath =
          assignment.get("collect_path") +
          "/" +
          student.get("student_id") +
          "/" +
          file;
        const student_ipynb: string = await jupyter_strip_notebook(
          course_project_id,
          fullpath
        );
        if (instructor_ipynb_files == null) throw Error("BUG");
        const instructor_ipynb: string = instructor_ipynb_files[file];
        if (this.course_actions.is_closed()) return;
        const id = this.course_actions.set_activity({
          desc: `Ensuring ${store.get_student_name(
            student_id
          )}'s project is running`,
        });
        try {
          await start_project(grade_project_id, 60);
        } finally {
          this.course_actions.clear_activity(id);
        }
        const r = await nbgrader({
          timeout_ms: store.getIn(
            ["settings", "nbgrader_timeout_ms"],
            NBGRADER_TIMEOUT_MS
          ), // default timeout for total notebook
          cell_timeout_ms: store.getIn(
            ["settings", "nbgrader_cell_timeout_ms"],
            NBGRADER_CELL_TIMEOUT_MS
          ), // per cell timeout
          student_ipynb,
          instructor_ipynb,
          path: student_path,
          project_id: grade_project_id,
        });
        /*console.log("nbgrader finished successfully", {
          student_id,
          file,
          r,
        });*/
        result[file] = r;
      } catch (err) {
        // console.log("nbgrader failed", { student_id, file, err });
        scores[file] = `${err}`;
      } finally {
        this.course_actions.clear_activity(activity_id);
      }
    };

    // NOTE: we *could* run multipel files in parallel, but that causes
    // trouble for very little benefit.  It's better to run across all students in parallel,
    // and the trouble is just that running lots of code in the same project can confuse
    // the backend api and use extra memory (which is unfair to students being graded, e.g.,
    // if their project has 1GB of RAM and we run 3 notebooks at once, they get "gypped").
    try {
      this.nbgrader_set_is_running(assignment_id, student_id);

      for (const file in instructor_ipynb_files) {
        await one_file(file);
      }
    } finally {
      this.nbgrader_set_is_done(assignment_id, student_id);
    }
    /* console.log("ran nbgrader for all files for a student", {
      student_id,
      result
    }); */
    // Save any previous nbgrader scores for this student, so we can
    // preserve any manually entered scores, rather than overwrite them.
    const prev_scores = store.get_nbgrader_scores(assignment_id, student_id);

    for (const filename in result) {
      const r = result[filename];
      if (r == null) continue;
      if (r.output == null) continue;

      // Depending on instructor options, write the graded version of
      // the notebook to disk, so the student can see why their grade
      // is what it is:
      const notebook = JSON.parse(r.output);
      scores[filename] = extract_auto_scores(notebook);
      if (
        prev_scores != null &&
        prev_scores[filename] != null &&
        typeof prev_scores[filename] != "string"
      ) {
        // preserve any manual scores.  cast since for some reason the typeof above isn't enough.
        for (const id in prev_scores[filename] as object) {
          const x = prev_scores[filename][id];
          if (x.manual && x.score && scores[filename][id] != null) {
            scores[filename][id].score = x.score;
          }
        }
      }

      if (!nbgrader_include_hidden_tests) {
        // IMPORTANT: this *must* happen after extracting scores above!
        // Otherwise students get perfect grades.
        ipynb_clear_hidden_tests(notebook);
      }

      await this.write_autograded_notebook(
        assignment,
        student_id,
        filename,
        JSON.stringify(notebook, undefined, 2)
      );
    }

    this.set_nbgrader_scores_for_one_student(
      assignment_id,
      student_id,
      scores,
      commit
    );
  }

  public autograded_path(
    assignment: AssignmentRecord,
    student_id: string,
    filename: string
  ): string {
    return autograded_filename(
      assignment.get("collect_path") + "/" + student_id + "/" + filename
    );
  }

  private async write_autograded_notebook(
    assignment: AssignmentRecord,
    student_id: string,
    filename: string,
    content: string
  ): Promise<void> {
    const path = this.autograded_path(assignment, student_id, filename);
    await this.write_text_file_to_course_project({ path, content });
  }

  public async open_file_in_collected_assignment(
    assignment_id: string,
    student_id: string,
    file: string
  ): Promise<void> {
    const { assignment, student, store } = this.course_actions.resolve({
      assignment_id,
      student_id,
    });
    if (assignment == null || student == null) {
      throw Error("no such student or assignment");
    }
    const course_project_id = store.get("course_project_id");
    const fullpath =
      assignment.get("collect_path") +
      "/" +
      student.get("student_id") +
      "/" +
      file;

    await redux
      .getProjectActions(course_project_id)
      .open_file({ path: fullpath, foreground: true });
  }

  private nbgrader_set_is_running(
    assignment_id: string,
    student_id?: string
  ): void {
    const store = this.get_store();
    let nbgrader_run_info: NBgraderRunInfo = store.get(
      "nbgrader_run_info",
      Map()
    );
    const key = student_id ? `${assignment_id}-${student_id}` : assignment_id;
    nbgrader_run_info = nbgrader_run_info.set(key, new Date().valueOf());
    this.course_actions.setState({ nbgrader_run_info });
  }

  private nbgrader_set_is_done(
    assignment_id: string,
    student_id?: string
  ): void {
    const store = this.get_store();
    let nbgrader_run_info: NBgraderRunInfo = store.get(
      "nbgrader_run_info",
      Map<string, number>()
    );
    const key = student_id ? `${assignment_id}-${student_id}` : assignment_id;
    nbgrader_run_info = nbgrader_run_info.delete(key);
    this.course_actions.setState({ nbgrader_run_info });
  }

  public async export_file_use_times(
    assignment_id: string,
    json_filename: string
  ): Promise<void> {
    // Get the path of the assignment
    const { assignment, store } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) {
      throw Error("no such assignment");
    }
    const src_path = this.assignment_src_path(assignment);
    const target_path = assignment.get("path");
    await export_student_file_use_times(
      store.get("course_project_id"),
      src_path,
      target_path,
      store.get("students"),
      json_filename,
      store.get_student_name.bind(store)
    );
  }

  public async export_collected(assignment_id: string): Promise<void> {
    const set_activity = this.course_actions.set_activity.bind(
      this.course_actions
    );
    const id = set_activity({
      desc: "Exporting collected files...",
    });
    try {
      const { assignment, store } = this.course_actions.resolve({
        assignment_id,
      });
      if (assignment == null) return;
      const students = store.get("students");
      const src_path = this.assignment_src_path(assignment);
      const collect_path = assignment.get("collect_path");
      const i = store.get("course_filename").lastIndexOf(".");
      const base_export_path =
        store.get("course_filename").slice(0, i) + "-export";
      const export_path = base_export_path + "/" + src_path;

      const student_name = function (student_id: string): string {
        const v = split(store.get_student_name(student_id));
        return v.join("_");
      };

      const activity = function (s: string): void {
        set_activity({
          id,
          desc: "Exporting collected files... " + s,
        });
      };

      const project_id = store.get("course_project_id");

      await export_assignment(
        project_id,
        collect_path,
        export_path,
        students,
        student_name,
        activity
      );

      redux.getProjectActions(project_id).open_directory(base_export_path);
    } catch (err) {
      this.course_actions.set_error(
        `Error exporting collected student files -- ${err}`
      );
    } finally {
      set_activity({ id });
    }
  }
}
