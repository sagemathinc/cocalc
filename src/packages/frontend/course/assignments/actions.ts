/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Actions involving working with assignments:
  - assigning, collecting, setting feedback, etc.
*/

import { delay, map } from "awaiting";
import { Map } from "immutable";
import { debounce } from "lodash";
import { join } from "path";
import { redux } from "@cocalc/frontend/app-framework";
import {
  exec,
  start_project,
  stop_project,
} from "@cocalc/frontend/frame-editors/generic/client";
import {
  jupyter_strip_notebook,
  nbgrader,
} from "@cocalc/frontend/jupyter/nbgrader/api";
import {
  extract_auto_scores,
  NotebookScores,
} from "@cocalc/frontend/jupyter/nbgrader/autograde";
import { ipynb_clear_hidden_tests } from "@cocalc/frontend/jupyter/nbgrader/clear-hidden-tests";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  defaults,
  endswith,
  len,
  path_split,
  peer_grading,
  split,
  trunc,
  uuid,
} from "@cocalc/util/misc";
import { CourseActions } from "../actions";
import { export_assignment } from "../export/export-assignment";
import { export_student_file_use_times } from "../export/file-use-times";
import { grading_state } from "../nbgrader/util";
import {
  AssignmentRecord,
  CourseStore,
  get_nbgrader_score,
  NBgraderRunInfo,
} from "../store";
import {
  AssignmentCopyType,
  copy_type_to_last,
  LastAssignmentCopyType,
  SyncDBRecord,
  SyncDBRecordAssignment,
} from "../types";
import {
  assignment_identifier,
  autograded_filename,
  previous_step,
} from "../util";
import {
  NBGRADER_CELL_TIMEOUT_MS,
  NBGRADER_MAX_OUTPUT,
  NBGRADER_MAX_OUTPUT_PER_CELL,
  NBGRADER_TIMEOUT_MS,
  PEER_GRADING_GUIDE_FILENAME,
  PEER_GRADING_GUIDELINES_COMMENT_MARKER,
  PEER_GRADING_GUIDELINES_GRADE_MARKER,
  STUDENT_SUBDIR,
} from "./consts";
import { DUE_DATE_FILENAME } from "../common/consts";

const UPDATE_DUE_DATE_FILENAME_DEBOUNCE_MS = 3000;

export class AssignmentsActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private get_store = (): CourseStore => {
    return this.course_actions.get_store();
  };

  private collect_path = (path: string): string => {
    const store = this.get_store();
    if (store == undefined) {
      throw Error("store must be defined");
    }
    const i = store.get("course_filename").lastIndexOf(".");
    return store.get("course_filename").slice(0, i) + "-collect/" + path;
  };

  // slight warning -- this is linear in the number of assignments (so do not overuse)
  private getAssignmentWithPath = (
    path: string,
  ): AssignmentRecord | undefined => {
    const store = this.get_store();
    if (store == null) return;
    return store
      .get("assignments")
      .valueSeq()
      .filter((x) => x.get("path") == path)
      .get(0);
  };

  addAssignment = async (path: string | string[]): Promise<void> => {
    // Add one or more assignment to the course, which is defined by giving a directory in the project.
    // Where we collect homework that students have done (in teacher project).
    // If the assignment was previously deleted, this undeletes it.
    if (typeof path != "string") {
      // handle case of array of inputs
      for (const p of path) {
        await this.addAssignment(p);
      }
      return;
    }
    const cur = this.getAssignmentWithPath(path);
    if (cur != null) {
      // either undelete or nothing to do.
      if (cur.get("deleted")) {
        // undelete
        this.undelete_assignment(cur.get("assignment_id"));
      } else {
        // nothing to do
      }
      return;
    }

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
  };

  delete_assignment = (assignment_id: string): void => {
    this.course_actions.set({
      deleted: true,
      assignment_id,
      table: "assignments",
    });
  };

  undelete_assignment = (assignment_id: string): void => {
    this.course_actions.set({
      deleted: false,
      assignment_id,
      table: "assignments",
    });
  };

  clear_edited_feedback = (assignment_id: string, student_id: string): void => {
    const store = this.get_store();
    let active_feedback_edits = store.get("active_feedback_edits");
    active_feedback_edits = active_feedback_edits.delete(
      assignment_identifier(assignment_id, student_id),
    );
    this.course_actions.setState({ active_feedback_edits });
  };

  update_edited_feedback = (assignment_id: string, student_id: string) => {
    const store = this.get_store();
    const key = assignment_identifier(assignment_id, student_id);
    const old_edited_feedback = store.get("active_feedback_edits");
    const new_edited_feedback = old_edited_feedback.set(key, true);
    this.course_actions.setState({
      active_feedback_edits: new_edited_feedback,
    });
  };

  // Set a specific grade for a student in an assignment.
  // This overlaps with save_feedback, but is more
  // direct and uses that maybe the user isn't manually editing
  // this.  E.g., nbgrader uses this to automatically set the grade.
  set_grade = (
    assignment_id: string,
    student_id: string,
    grade: string,
    commit: boolean = true,
  ): void => {
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
      commit,
    );
  };

  // Set a specific comment for a student in an assignment.
  set_comment = (
    assignment_id: string,
    student_id: string,
    comment: string,
    commit: boolean = true,
  ): void => {
    const { assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) {
      throw Error("no such assignment");
    }
    // Annoying that we have to convert to JS here and cast,
    // but the set below seems to require it.
    let comments = assignment.get("comments", Map()).toJS() as {
      [student_id: string]: string;
    };
    comments[student_id] = comment;
    this.course_actions.set(
      {
        table: "assignments",
        assignment_id,
        comments,
      },
      commit,
    );
  };

  set_active_assignment_sort = (column_name: string): void => {
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
  };

  private set_assignment_field = (
    assignment_id: string,
    name: string,
    val,
  ): void => {
    this.course_actions.set({
      [name]: val,
      table: "assignments",
      assignment_id,
    });
  };

  set_due_date = async (
    assignment_id: string,
    due_date: Date | string | undefined | null,
  ): Promise<void> => {
    const { assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) {
      return;
    }
    const prev_due_date = assignment.get("due_date");

    if (!due_date) {
      // deleting it
      if (prev_due_date) {
        // not deleted so delete it
        this.set_assignment_field(assignment_id, "due_date", null);
        this.updateDueDateFile(assignment_id);
      }
      return;
    }

    if (typeof due_date !== "string") {
      due_date = due_date.toISOString(); // using strings instead of ms for backward compatibility.
    }

    if (prev_due_date == due_date) {
      // nothing to do.
      return;
    }

    this.set_assignment_field(assignment_id, "due_date", due_date);
    // it changed, so update the file in all student projects that have already been assigned
    // https://github.com/sagemathinc/cocalc/issues/2929
    // NOTE: updateDueDate is debounced, so if set_due_date is called a lot, then the
    // actual update only happens after it stabilizes for a while.  Also, we can be
    // sure the store has updated the assignment.
    this.updateDueDateFile(assignment_id);
  };

  private updateDueDateFile = debounce(async (assignment_id: string) => {
    // important to check actions due to debounce.
    if (this.course_actions.is_closed()) return;
    await this.copy_assignment_create_due_date_file(assignment_id);
    if (this.course_actions.is_closed()) return;

    const desc = `Copying modified ${DUE_DATE_FILENAME} to all students who have already received it`;
    const short_desc = `copy ${DUE_DATE_FILENAME}`;

    // by default, doesn't create the due file
    await this.assignment_action_all_students({
      assignment_id,
      old_only: true,
      action: this.writeDueDateFile,
      step: "assignment",
      desc,
      short_desc,
    });
  }, UPDATE_DUE_DATE_FILENAME_DEBOUNCE_MS);

  private writeDueDateFile = async (
    assignment_id: string,
    student_id: string,
  ) => {
    const { student, assignment } = this.course_actions.resolve({
      assignment_id,
      student_id,
    });
    if (!student || !assignment) return;
    const content = this.dueDateFileContent(assignment_id);
    const project_id = student.get("project_id");
    if (!project_id) return;
    const path = join(assignment.get("target_path"), DUE_DATE_FILENAME);
    console.log({
      project_id,
      path,
      content,
    });
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content,
    });
  };

  set_assignment_note = (assignment_id: string, note: string): void => {
    this.set_assignment_field(assignment_id, "note", note);
  };

  set_peer_grade = (assignment_id: string, config): void => {
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
  };

  set_skip = (assignment_id: string, step: string, value: boolean): void => {
    this.set_assignment_field(assignment_id, "skip_" + step, value);
  };

  // Synchronous function that makes the peer grading map for the given
  // assignment, if it hasn't already been made.
  private update_peer_assignment = (assignment_id: string) => {
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
  };

  // Copy the files for the given assignment_id from the given student to the
  // corresponding collection folder.
  // If the store is initialized and the student and assignment both exist,
  // then calling this action will result in this getting set in the store:
  //
  //    assignment.last_collect[student_id] = {time:?, error:err}
  //
  // where time >= now is the current time in milliseconds.
  private copy_assignment_from_student = async (
    assignment_id: string,
    student_id: string,
  ): Promise<void> => {
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
    const target_path = join(
      assignment.get("collect_path"),
      student.get("student_id"),
    );
    this.course_actions.set_activity({
      id,
      desc: `Copying assignment from ${student_name}`,
    });
    try {
      await webapp_client.project_client.copyPathBetweenProjects({
        src: {
          project_id: student_project_id,
          path: assignment.get("target_path"),
        },
        dest: { project_id: store.get("course_project_id"), path: target_path },
        options: { recursive: true },
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
  };

  // Copy the graded files for the given assignment_id back to the student in a -graded folder.
  // If the store is initialized and the student and assignment both exist,
  // then calling this action will result in this getting set in the store:
  //
  //    assignment.last_return_graded[student_id] = {time:?, error:err}
  //
  // where time >= now is the current time in milliseconds.

  private return_assignment_to_student = async (
    assignment_id: string,
    student_id: string,
  ): Promise<void> => {
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
    src_path = join(src_path, student.get("student_id"));
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
You can find the comments they made above and any directly to your work in the folders below.\
`;
    }

    const nbgrader_scores = store.get_nbgrader_scores(
      assignment_id,
      student_id,
    );
    const nbgrader_score_ids = store.get_nbgrader_score_ids(assignment_id);
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
          const ids: string[] = nbgrader_score_ids?.[filename] ?? [];
          for (const id in s) {
            if (!ids.includes(id)) {
              ids.push(id);
            }
          }
          for (const id of ids) {
            if (s[id] != null) {
              const t = `${s[id]?.score ?? 0}`;
              details += `| ${id.padEnd(10)}| ${t.padEnd(10)}|\n`;
            }
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
      await webapp_client.project_client.copyPathBetweenProjects({
        src: { project_id: store.get("course_project_id"), path: src_path },
        dest: {
          project_id: student_project_id,
          path: assignment.get("graded_path"),
        },
        options: {
          recursive: true,
        },
      });
      if (peer_graded) {
        const fs = redux.getProjectActions(student_project_id).fs(0);
        const v = await fs.readdir(assignment.get("graded_path"));
        const paths = v
          .filter((path) => path.includes("GRADER"))
          .map((path) => join(assignment.get("graded_path"), path));
        await fs.rm(paths, { force: true });
      }
      finish("");
    } catch (err) {
      finish(err);
    }
  };

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  return_assignment_to_all_students = async (
    assignment_id: string,
    new_only: boolean,
  ): Promise<void> => {
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
          true,
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

    await map(
      store.get_student_ids({ deleted: false }),
      store.get_copy_parallel(),
      f,
    );
    if (errors) {
      finish(errors);
    } else {
      this.course_actions.clear_activity(id);
    }
  };

  private finish_copy = (
    assignment_id: string,
    student_id: string,
    type: LastAssignmentCopyType,
    err: any,
  ): void => {
    const obj: SyncDBRecord = {
      table: "assignments",
      assignment_id,
    };
    const a = this.course_actions.get_one(obj);
    if (a == null) return;
    const x = a[type] ? a[type] : {};
    if (err) {
      x[student_id] = { error: err };
    } else {
      x[student_id] = { time: webapp_client.server_time() };
    }
    obj[type] = x;
    this.course_actions.set(obj);
  };

  // This is called internally before doing any copy/collection operation
  // to ensure that we aren't doing the same thing repeatedly, and that
  // everything is in place to do the operation.
  private start_copy = (
    assignment_id: string,
    student_id: string,
    type: LastAssignmentCopyType,
  ): boolean => {
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
    y.start = webapp_client.server_time();
    if (y.error) {
      // clear error when initiating copy
      y.error = "";
    }
    x[student_id] = y;
    obj[type] = x;
    this.course_actions.set(obj);
    return false;
  };

  private stop_copy = (
    assignment_id: string,
    student_id: string,
    type: LastAssignmentCopyType,
  ): void => {
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
  };

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
  private copy_assignment_to_student = async (
    assignment_id: string,
    student_id: string,
    opts: object,
  ): Promise<void> => {
    const { overwrite, create_due_date_file } = defaults(opts, {
      overwrite: false,
      create_due_date_file: false,
    });
    const { student, assignment, store } = this.course_actions.resolve({
      student_id,
      assignment_id,
    });
    if (!student || !assignment) return;
    if (assignment.get("nbgrader") && !assignment.get("has_student_subdir")) {
      this.course_actions.set_error(
        "Assignment contains Jupyter notebooks with nbgrader metadata but there is no student/ subdirectory. The student/ subdirectory gets created when you generate the student version of the assignment.  Please generate the student versions of your notebooks (open the notebook, then View --> nbgrader), or remove any nbgrader metadata from them.",
      );
      return;
    }

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
        student_project_id =
          await this.course_actions.student_projects.create_student_project(
            student_id,
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
      const opts = {
        src: { project_id: store.get("course_project_id"), path: src_path },
        dest: {
          project_id: student_project_id,
          path: assignment.get("target_path"),
        },
        options: { recursive: true, force: !!overwrite },
      };
      await webapp_client.project_client.copyPathBetweenProjects(opts);
      await this.course_actions.compute.setComputeServerAssociations({
        student_id,
        src_path,
        target_project_id: student_project_id,
        target_path: assignment.get("target_path"),
        unit_id: assignment_id,
      });

      // successful finish
      finish();
    } catch (err) {
      // error somewhere along the way
      finish(err);
    }
  };

  private assignment_src_path = (assignment): string => {
    let path = assignment.get("path");
    if (assignment.get("has_student_subdir")) {
      path = join(path, STUDENT_SUBDIR);
    }
    return path;
  };

  // this is part of the assignment disribution, should be done only *once*, not for every student
  private copy_assignment_create_due_date_file = async (
    assignment_id: string,
  ): Promise<void> => {
    const { assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (!assignment) return;
    // write the due date to a file
    const src_path = this.assignment_src_path(assignment);
    const due_id = this.course_actions.set_activity({
      desc: `Creating ${DUE_DATE_FILENAME} file...`,
    });
    const content = this.dueDateFileContent(assignment_id);
    const path = join(src_path, DUE_DATE_FILENAME);

    try {
      await this.write_text_file_to_course_project({
        path,
        content,
      });
    } catch (err) {
      throw Error(
        `Problem writing ${DUE_DATE_FILENAME} file ('${err}'). Try again...`,
      );
    } finally {
      this.course_actions.clear_activity(due_id);
    }
  };

  private dueDateFileContent = (assignment_id) => {
    const due_date = this.get_store()?.get_due_date(assignment_id);
    if (due_date) {
      return `This assignment is due\n\n   ${due_date.toLocaleString()}`;
    } else {
      return "No due date has been set.";
    }
  };

  copy_assignment = async (
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string,
  ): Promise<void> => {
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
          `copy_assignment -- unknown type: ${type}`,
        );
        return;
    }
  };

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  copy_assignment_to_all_students = async (
    assignment_id: string,
    new_only: boolean,
    overwrite: boolean,
  ): Promise<void> => {
    const desc = `Copying assignments to all students ${
      new_only ? "who have not already received it" : ""
    }`;
    const short_desc = "copy to student";
    await this.update_listing(assignment_id); // make sure this is up to date
    if (this.course_actions.is_closed()) return;
    await this.copy_assignment_create_due_date_file(assignment_id);
    if (this.course_actions.is_closed()) return;
    // by default, doesn't create the due file
    await this.assignment_action_all_students({
      assignment_id,
      new_only,
      action: this.copy_assignment_to_student,
      step: "assignment",
      desc,
      short_desc,
      overwrite,
    });
  };

  // Copy the given assignment to from all non-deleted students, doing several copies in parallel at once.
  copy_assignment_from_all_students = async (
    assignment_id: string,
    new_only: boolean,
  ): Promise<void> => {
    let desc = "Copying assignment from all students";
    if (new_only) {
      desc += " from whom we have not already copied it";
    }
    const short_desc = "copy from student";
    await this.assignment_action_all_students({
      assignment_id,
      new_only,
      action: this.copy_assignment_from_student,
      step: "collect",
      desc,
      short_desc,
    });
  };

  private start_all_for_peer_grading = async (): Promise<void> => {
    // On cocalc.com, if the student projects get started specifically
    // for the purposes of copying files to/from them, then they stop
    // around a minute later.  This is very bad for peer grading, since
    // so much copying occurs, and we end up with conflicts between
    // projects starting to peer grade, then stop, then needing to be
    // started again all at once.  We thus request that they all start,
    // wait a few seconds for that "reason" for them to be running to
    // take effect, and then do the copy.  This way the projects aren't
    // automatically stopped after the copies happen.
    const id = this.course_actions.set_activity({
      desc: "Warming up all student projects for peer grading...",
    });
    this.course_actions.student_projects.action_all_student_projects("start");
    // We request to start all projects simultaneously, and the system
    // will start doing that.  I think it's not so much important that
    // the projects are actually running, but that they were started
    // before the copy operations started.
    await delay(5 * 1000);
    this.course_actions.clear_activity(id);
  };

  async peer_copy_to_all_students(
    assignment_id: string,
    new_only: boolean,
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
    try {
      this.update_peer_assignment(assignment_id);
    } catch (err) {
      this.course_actions.set_error(`${short_desc} -- ${err}`);
      return;
    }
    await this.start_all_for_peer_grading();
    // OK, now do the assignment... in parallel.
    await this.assignment_action_all_students({
      assignment_id,
      new_only,
      action: this.peer_copy_to_student,
      step: "peer_assignment",
      desc,
      short_desc,
    });
  }

  async peer_collect_from_all_students(
    assignment_id: string,
    new_only: boolean,
  ): Promise<void> {
    let desc = "Copying peer graded assignments from all students";
    if (new_only) {
      desc += " from whom we have not already copied it";
    }
    const short_desc = "copy peer grading from students";
    await this.start_all_for_peer_grading();
    await this.assignment_action_all_students({
      assignment_id,
      new_only,
      action: this.peer_collect_from_student,
      step: "peer_collect",
      desc,
      short_desc,
    });
    await this.peerParseStudentGrading(assignment_id);
  }

  private peerParseStudentGrading = async (assignment_id: string) => {
    // For each student do the following:
    //   If they already have a recorded grade, do nothing further.
    //   If they do not have a recorded grade, load all of the
    //   PEER_GRADING_GUIDE_FILENAME files that were collected
    //   from the students, then create a grade from that (if possible), along
    //   with a comment that explains how that grade was obtained, without
    //   saying which student did what.
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) {
      throw Error("no such assignment");
    }
    const id = this.course_actions.set_activity({
      desc: "Parsing peer grading",
    });
    const allGrades = assignment.get("grades", Map()).toJS() as {
      [student_id: string]: string;
    };
    const allComments = assignment.get("comments", Map()).toJS() as {
      [student_id: string]: string;
    };
    // compute missing grades
    for (const student_id of store.get_student_ids()) {
      if (allGrades[student_id]) {
        // a grade is already set
        continue;
      }
      // attempt to compute a grade
      const peer_student_ids: string[] = store.get_peers_that_graded_student(
        assignment_id,
        student_id,
      );
      const course_project_id = store.get("course_project_id");
      const grades: number[] = [];
      let comments: string[] = [];
      const student_name = store.get_student_name(student_id);
      this.course_actions.set_activity({
        id,
        desc: `Parsing peer grading of ${student_name}`,
      });
      for (const peer_student_id of peer_student_ids) {
        const path = join(
          `${assignment.get("collect_path")}-peer-grade`,
          student_id,
          peer_student_id,
          PEER_GRADING_GUIDE_FILENAME,
        );
        try {
          const contents = await webapp_client.project_client.read_text_file({
            project_id: course_project_id,
            path,
          });
          const i = contents.lastIndexOf(PEER_GRADING_GUIDELINES_GRADE_MARKER);
          if (i == -1) {
            continue;
          }
          let j = contents.lastIndexOf(PEER_GRADING_GUIDELINES_COMMENT_MARKER);
          if (j == -1) {
            j = contents.length;
          }
          const grade = parseFloat(
            contents
              .slice(i + PEER_GRADING_GUIDELINES_GRADE_MARKER.length, j)
              .trim(),
          );
          if (!isFinite(grade) && isNaN(grade)) {
            continue;
          }
          const comment = contents.slice(
            j + PEER_GRADING_GUIDELINES_COMMENT_MARKER.length,
          );
          grades.push(grade);
          comments.push(comment);
        } catch (err) {
          // grade not available for some reason
          console.warn("issue reading peer grading file", {
            path,
            err,
            student_name,
          });
        }
      }
      if (grades.length > 0) {
        const grade = grades.reduce((a, b) => a + b) / grades.length;
        allGrades[student_id] = `${grade}`;
        if (!allComments[student_id]) {
          const studentComments = comments
            .filter((x) => x.trim())
            .map((x) => `- ${x.trim()}`)
            .join("\n\n");
          allComments[student_id] = `Grades: ${grades.join(", ")}\n\n${
            studentComments ? "Student Comments:\n" + studentComments : ""
          }`;
        }
      }
    }
    // set them in the course data
    this.course_actions.set(
      {
        table: "assignments",
        assignment_id,
        grades: allGrades,
        comments: allComments,
      },
      true,
    );
    this.course_actions.clear_activity(id);
  };

  private assignment_action_all_students = async ({
    assignment_id,
    new_only,
    old_only,
    action,
    step,
    desc,
    short_desc,
    overwrite,
  }: {
    assignment_id: string;
    // only do the action when it hasn't been done already
    new_only?: boolean;
    // only do the action when it HAS been done already
    old_only?: boolean;
    action: (
      assignment_id: string,
      student_id: string,
      opts: any,
    ) => Promise<void>;
    step;
    desc;
    short_desc: string;
    overwrite?: boolean;
  }): Promise<void> => {
    if (new_only && old_only) {
      // no matter what, this means the empty set, so nothing to do.
      // Of course no code shouild actually call this.
      return;
    }
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
      const alreadyCopied = !!store.last_copied(
        step,
        assignment_id,
        student_id,
        true,
      );
      if (new_only && alreadyCopied) {
        // only for the ones that haven't already been copied
        return;
      }
      if (old_only && !alreadyCopied) {
        // only for the ones that *HAVE* already been copied.
        return;
      }
      try {
        await action(assignment_id, student_id, { overwrite });
      } catch (err) {
        errors += `\n ${err}`;
      }
    };

    await map(
      store.get_student_ids({ deleted: false }),
      store.get_copy_parallel(),
      f,
    );

    if (errors) {
      finish(errors);
    } else {
      this.course_actions.clear_activity(id);
    }
  };

  // Copy the collected folders from some students to the given student for peer grading.
  // Assumes folder is non-empty
  private peer_copy_to_student = async (
    assignment_id: string,
    student_id: string,
  ): Promise<void> => {
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

    let peer_map;
    try {
      // synchronous, but could fail, e.g., not enough students
      peer_map = this.update_peer_assignment(assignment_id);
    } catch (err) {
      this.course_actions.set_error(`peer copy to student: ${err}`);
      finish();
      return;
    }

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
    if (!student_project_id) {
      finish();
      return;
    }

    let guidelines: string = assignment.getIn(
      ["peer_grade", "guidelines"],
      "Please grade this assignment.",
    );
    const due_date = assignment.getIn(["peer_grade", "due_date"]);
    if (due_date != null) {
      guidelines =
        `GRADING IS DUE ${new Date(due_date).toLocaleString()} \n\n ` +
        guidelines;
    }

    const target_base_path = assignment.get("path") + "-peer-grade";
    const f = async (peer_student_id: string) => {
      if (this.course_actions.is_closed()) {
        return;
      }
      const src_path = join(assignment.get("collect_path"), peer_student_id);
      // write instructions file for the student, where they enter the grade,
      // and also it tells them what to do.
      await this.write_text_file_to_course_project({
        path: join(src_path, PEER_GRADING_GUIDE_FILENAME),
        content: guidelines,
      });
      const target_path = join(target_base_path, peer_student_id);
      // In the copy below, we exclude the student's name so that
      // peer grading is anonymous; also, remove original
      // due date to avoid confusion.
      // copy the files to be peer graded into place for this student
      await webapp_client.project_client.copyPathBetweenProjects({
        src: { project_id: store.get("course_project_id"), path: src_path },
        dest: { project_id: student_project_id, path: target_path },
        options: { recursive: true, force: false },
      });
      const fs = redux.getProjectActions(student_project_id).fs(0);
      const v = await fs.readdir(assignment.get("graded_path"));
      const paths = v
        .filter(
          (path) =>
            path.includes("STUDENT") || path.includes(DUE_DATE_FILENAME),
        )
        .map((path) => join(target_path, path));
      await fs.rm(paths, { force: true });
    };

    try {
      // now copy actual stuff to grade
      await map(peers, store.get_copy_parallel(), f);
      finish();
    } catch (err) {
      finish(err);
      return;
    }
  };

  // Collect all the peer graading of the given student (not the work the student did, but
  // the grading about the student!).
  private peer_collect_from_student = async (
    assignment_id: string,
    student_id: string,
  ): Promise<void> => {
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
          `collecting peer-grading of a student: ${err}`,
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
      student_id,
    );

    const our_student_id = student.get("student_id");

    const f = async (student_id: string): Promise<void> => {
      const s = store.get_student(student_id);
      // ignore deleted or non-existent students
      if (s == null || s.get("deleted")) return;

      const path = assignment.get("path");
      const src_path = join(`${path}-peer-grade`, our_student_id);
      const target_path = join(
        `${assignment.get("collect_path")}-peer-grade`,
        our_student_id,
        student_id,
      );

      const src_project_id = s.get("project_id");
      if (!src_project_id) {
        return;
      }

      // copy the files over from the student who did the peer grading
      await webapp_client.project_client.copyPathBetweenProjects({
        src: { project_id: src_project_id, path: src_path },
        dest: { project_id: store.get("course_project_id"), path: target_path },
        options: { force: false, recursive: true },
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
      await map(peers, store.get_copy_parallel(), f);
      finish();
    } catch (err) {
      finish(err);
    }
  };

  // This doesn't really stop it yet, since that's not supported by the backend.
  // It does stop the spinner and let the user try to restart the copy.
  stop_copying_assignment = (
    assignment_id: string,
    student_id: string,
    type: AssignmentCopyType,
  ): void => {
    this.stop_copy(assignment_id, student_id, copy_type_to_last(type));
  };

  open_assignment = (
    type: AssignmentCopyType,
    assignment_id: string,
    student_id: string,
  ): void => {
    const { store, assignment, student } = this.course_actions.resolve({
      assignment_id,
      student_id,
    });
    if (assignment == null || student == null) return;
    const student_project_id = student.get("project_id");
    if (student_project_id == null) {
      this.course_actions.set_error(
        "open_assignment: student project not yet created",
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
        path = join(assignment.get("collect_path"), student.get("student_id")); // TODO: refactor
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
          `open_assignment -- unknown type: ${type}`,
        );
    }
    if (proj == null) {
      this.course_actions.set_error("no such project");
      return;
    }
    // Now open it
    redux.getProjectActions(proj).open_directory(path);
  };

  private write_text_file_to_course_project = async (opts: {
    path: string;
    content: string;
  }): Promise<void> => {
    await webapp_client.project_client.write_text_file({
      project_id: this.get_store().get("course_project_id"),
      path: opts.path,
      content: opts.content,
    });
  };

  // Update datastore with directory listing of non-hidden content of the assignment.
  // This also sets whether or not there is a STUDENT_SUBDIR directory.
  update_listing = async (assignment_id: string): Promise<void> => {
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
        compute_server_id: 0, // TODO
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
      if (entry.isDir && entry.name == STUDENT_SUBDIR) {
        has_student_subdir = true;
        break;
      }
    }
    const nbgrader = await this.has_nbgrader_metadata(assignment_id);
    if (this.course_actions.is_closed()) return;
    this.course_actions.set({
      has_student_subdir,
      nbgrader,
      assignment_id,
      table: "assignments",
    });
  };

  /* Scan all Jupyter notebooks in the top level of either the assignment directory or
     the student/
     subdirectory of it for cells with nbgrader metadata.  If any are found, return
     true; otherwise, return false.
  */
  private has_nbgrader_metadata = async (
    assignment_id: string,
  ): Promise<boolean> => {
    return len(await this.nbgrader_instructor_ipynb_files(assignment_id)) > 0;
  };

  // Read in the (stripped) contents of all nbgrader instructor ipynb
  // files for this assignment.  These are:
  //  - Every ipynb file in the assignment directory that has a cell that
  //    contains nbgrader metadata (and isn't mangled).
  private nbgrader_instructor_ipynb_files = async (
    assignment_id: string,
  ): Promise<{ [path: string]: string }> => {
    const { store, assignment } = this.course_actions.resolve({
      assignment_id,
    });
    if (assignment == null) {
      return {}; // nothing case.
    }
    const path = assignment.get("path");
    const project_id = store.get("course_project_id");
    let files;
    try {
      const { fs } = this.course_actions.syncdb;
      files = await fs.readdir(path, { withFileTypes: true });
    } catch (err) {
      // This happens, e.g., if the instructor moves the directory
      // that contains their version of the ipynb file.
      // See https://github.com/sagemathinc/cocalc/issues/5501
      const error = `Unable to find the directory where you created this assignment.  If you moved or renamed it, please move or copy it back to "${path}", then try again.    (${err})`;
      this.course_actions.set_error(error);
      throw err;
    }
    const result: { [path: string]: string } = {};

    if (this.course_actions.is_closed()) return result;

    const to_read = files
      .filter((entry) => entry.isFile() && endswith(entry.name, ".ipynb"))
      .map((entry) => entry.name);

    const f: (file: string) => Promise<void> = async (file) => {
      if (this.course_actions.is_closed()) return;
      const fullpath = path != "" ? join(path, file) : file;
      try {
        const content = await jupyter_strip_notebook(project_id, fullpath);
        const { cells } = JSON.parse(content);
        for (const cell of cells) {
          if (cell.metadata.nbgrader) {
            result[file] = content;
            return;
          }
        }
      } catch (err) {
        return;
      }
    };

    await map(to_read, 10, f);
    return result;
  };

  // Run nbgrader for all students for which this assignment
  // has been collected at least once.
  run_nbgrader_for_all_students = async (
    assignment_id: string,
    ungraded_only?: boolean,
  ): Promise<void> => {
    // console.log("run_nbgrader_for_all_students", assignment_id);
    const instructor_ipynb_files =
      await this.nbgrader_instructor_ipynb_files(assignment_id);
    if (this.course_actions.is_closed()) return;
    const store = this.get_store();
    const nbgrader_scores = store.getIn([
      "assignments",
      assignment_id,
      "nbgrader_scores",
    ]);
    const one_student: (student_id: string) => Promise<void> = async (
      student_id,
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
        true,
      );
    };
    try {
      this.nbgrader_set_is_running(assignment_id);
      await map(
        this.get_store().get_student_ids({ deleted: false }),
        this.get_store().get_nbgrader_parallel(),
        one_student,
      );
      this.course_actions.syncdb.commit();
    } finally {
      this.nbgrader_set_is_done(assignment_id);
    }
  };

  set_nbgrader_scores_for_all_students = ({
    assignment_id,
    force,
    commit,
  }: {
    assignment_id: string;
    force?: boolean;
    commit?: boolean;
  }): void => {
    for (const student_id of this.get_store().get_student_ids({
      deleted: false,
    })) {
      this.set_grade_using_nbgrader_if_possible(
        assignment_id,
        student_id,
        false,
        force,
      );
    }
    if (commit) {
      this.course_actions.syncdb.commit();
    }
  };

  set_nbgrader_scores_for_one_student = (
    assignment_id: string,
    student_id: string,
    scores: { [filename: string]: NotebookScores | string },
    nbgrader_score_ids:
      | { [filename: string]: string[] }
      | undefined = undefined,
    commit: boolean = true,
  ): void => {
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
        ...(nbgrader_score_ids != null ? { nbgrader_score_ids } : undefined),
      },
      commit,
    );
    this.set_grade_using_nbgrader_if_possible(
      assignment_id,
      student_id,
      commit,
    );
  };

  set_specific_nbgrader_score = (
    assignment_id: string,
    student_id: string,
    filename: string,
    grade_id: string,
    score: number,
    commit: boolean = true,
  ): void => {
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
      undefined,
      commit,
    );

    this.set_grade_using_nbgrader_if_possible(
      assignment_id,
      student_id,
      commit,
    );
  };

  // Fill in manual grade if it is blank and there is an nbgrader grade
  // and all the manual nbgrader scores have been filled in.
  // Also, the filled in grade uses a specific format [number]/[total]
  // and if this is maintained and the nbgrader scores change, this
  // the manual grade is updated.
  set_grade_using_nbgrader_if_possible = (
    assignment_id: string,
    student_id: string,
    commit: boolean = true,
    force: boolean = false,
  ): void => {
    // Check if nbgrader scores are all available.
    const store = this.get_store();
    const scores = store.get_nbgrader_scores(assignment_id, student_id);
    if (scores == null) {
      // no info -- maybe nbgrader not even run yet.
      return;
    }
    const { score, points, error, manual_needed } = get_nbgrader_score(scores);
    if (!force && (error || manual_needed)) {
      // more work must be done before we can use this.
      return;
    }

    // Fill in the overall grade if either it is currently unset, blank,
    // or of the form [number]/[number].
    const grade = store.get_grade(assignment_id, student_id).trim();
    if (force || grade == "" || grade.match(/\d+\/\d+/g)) {
      this.set_grade(assignment_id, student_id, `${score}/${points}`, commit);
    }
  };

  run_nbgrader_for_one_student = async (
    assignment_id: string,
    student_id: string,
    instructor_ipynb_files?: { [path: string]: string },
    commit: boolean = true,
  ): Promise<void> => {
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
    const student_project_id = student.get("project_id");

    let grade_project_id: string;
    let student_path: string;
    let stop_student_project = false;
    if (nbgrader_grade_project) {
      grade_project_id = nbgrader_grade_project;

      // grade in the path where we collected their work.
      student_path = join(
        assignment.get("collect_path"),
        student.get("student_id"),
      );

      this.course_actions.configuration.configure_nbgrader_grade_project(
        grade_project_id,
      );
    } else {
      if (student_project_id == null) {
        // This would happen if maybe instructor deletes student project at
        // the exact wrong time.
        // TODO: just create a new project for them?
        throw Error("student has no project, so can't run nbgrader");
      }
      grade_project_id = student_project_id;
      // grade right where student did their work.
      student_path = assignment.get("target_path");
    }

    const where_grade =
      redux.getStore("projects").get_title(grade_project_id) ?? "a project";

    const project_name = nbgrader_grade_project
      ? `project ${trunc(where_grade, 40)}`
      : `${store.get_student_name(student_id)}'s project`;

    if (instructor_ipynb_files == null) {
      instructor_ipynb_files =
        await this.nbgrader_instructor_ipynb_files(assignment_id);
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

    const result: { [path: string]: any } = {};
    const scores: { [filename: string]: NotebookScores | string } = {};

    const one_file: (file: string) => Promise<void> = async (file) => {
      const activity_id = this.course_actions.set_activity({
        desc: `Running nbgrader on ${store.get_student_name(
          student_id,
        )}'s "${file}" in '${trunc(where_grade, 40)}'`,
      });
      if (assignment == null || student == null) {
        // This won't happen, but it makes Typescript happy.
        return;
      }
      try {
        // fullpath = where their collected work is.
        const fullpath = join(
          assignment.get("collect_path"),
          student.get("student_id"),
          file,
        );
        const student_ipynb: string = await jupyter_strip_notebook(
          course_project_id,
          fullpath,
        );
        if (instructor_ipynb_files == null) throw Error("BUG");
        const instructor_ipynb: string = instructor_ipynb_files[file];
        if (this.course_actions.is_closed()) return;

        const id = this.course_actions.set_activity({
          desc: `Ensuring ${project_name} is running`,
        });

        try {
          const did_start = await start_project(grade_project_id, 60);
          // if *we* started the student project, we'll also stop it afterwards
          if (!nbgrader_grade_project) {
            stop_student_project = did_start;
          }
        } finally {
          this.course_actions.clear_activity(id);
        }

        let ephemeralGradePath;
        try {
          if (
            grade_project_id != course_project_id &&
            grade_project_id != student_project_id
          ) {
            ephemeralGradePath = true;
            // Make a fresh copy of the assignment files to the grade project.
            // This is necessary because grading the assignment may depend on
            // data files that are sent as part of the assignment.  Also,
            // student's might have some code in text files next to the ipynb.
            await webapp_client.project_client.copyPathBetweenProjects({
              src: { project_id: course_project_id, path: student_path },
              dest: { project_id: grade_project_id, path: student_path },
              options: { recursive: true },
            });
          } else {
            ephemeralGradePath = false;
          }

          const opts = {
            timeout_ms: store.getIn(
              ["settings", "nbgrader_timeout_ms"],
              NBGRADER_TIMEOUT_MS,
            ),
            cell_timeout_ms: store.getIn(
              ["settings", "nbgrader_cell_timeout_ms"],
              NBGRADER_CELL_TIMEOUT_MS,
            ),
            max_output: store.getIn(
              ["settings", "nbgrader_max_output"],
              NBGRADER_MAX_OUTPUT,
            ),
            max_output_per_cell: store.getIn(
              ["settings", "nbgrader_max_output_per_cell"],
              NBGRADER_MAX_OUTPUT_PER_CELL,
            ),
            student_ipynb,
            instructor_ipynb,
            path: student_path,
            project_id: grade_project_id,
          };
          /*console.log(
          student_id,
          file,
          "about to launch autograding with input ",
          opts
        );*/
          const r = await nbgrader(opts);
          /* console.log(student_id, "autograding finished successfully", {
          file,
          r,
        });*/
          result[file] = r;
        } finally {
          if (ephemeralGradePath) {
            await webapp_client.project_client.exec({
              project_id: grade_project_id,
              command: "rm",
              args: ["-rf", student_path],
            });
          }
        }

        if (!nbgrader_grade_project && stop_student_project) {
          const idstop = this.course_actions.set_activity({
            desc: `Stopping project ${project_name} after grading.`,
          });
          try {
            await stop_project(grade_project_id, 60);
          } finally {
            this.course_actions.clear_activity(idstop);
          }
        }
      } catch (err) {
        // console.log("nbgrader failed", { student_id, file, err });
        scores[file] = `${err}`;
      } finally {
        this.course_actions.clear_activity(activity_id);
      }
    };

    // NOTE: we *could* run multiple files in parallel, but that causes
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

    const nbgrader_score_ids: { [filename: string]: string[] } = {};

    for (const filename in result) {
      const r = result[filename];
      if (r == null) continue;
      if (r.output == null) continue;
      if (r.ids != null) {
        nbgrader_score_ids[filename] = r.ids;
      }

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
        JSON.stringify(notebook, undefined, 2),
      );
    }

    this.set_nbgrader_scores_for_one_student(
      assignment_id,
      student_id,
      scores,
      nbgrader_score_ids,
      commit,
    );
  };

  autograded_path = (
    assignment: AssignmentRecord,
    student_id: string,
    filename: string,
  ): string => {
    return autograded_filename(
      join(assignment.get("collect_path"), student_id, filename),
    );
  };

  private write_autograded_notebook = async (
    assignment: AssignmentRecord,
    student_id: string,
    filename: string,
    content: string,
  ): Promise<void> => {
    const path = this.autograded_path(assignment, student_id, filename);
    await this.write_text_file_to_course_project({ path, content });
  };

  open_file_in_collected_assignment = async (
    assignment_id: string,
    student_id: string,
    file: string,
  ): Promise<void> => {
    const { assignment, student, store } = this.course_actions.resolve({
      assignment_id,
      student_id,
    });
    if (assignment == null || student == null) {
      throw Error("no such student or assignment");
    }
    const course_project_id = store.get("course_project_id");
    const fullpath = join(
      assignment.get("collect_path"),
      student.get("student_id"),
      file,
    );

    await redux
      .getProjectActions(course_project_id)
      .open_file({ path: fullpath, foreground: true });
  };

  private nbgrader_set_is_running = (
    assignment_id: string,
    student_id?: string,
  ): void => {
    const store = this.get_store();
    let nbgrader_run_info: NBgraderRunInfo = store.get(
      "nbgrader_run_info",
      Map(),
    );
    const key = student_id ? `${assignment_id}-${student_id}` : assignment_id;
    nbgrader_run_info = nbgrader_run_info.set(key, webapp_client.server_time());
    this.course_actions.setState({ nbgrader_run_info });
  };

  private nbgrader_set_is_done = (
    assignment_id: string,
    student_id?: string,
  ): void => {
    const store = this.get_store();
    let nbgrader_run_info: NBgraderRunInfo = store.get(
      "nbgrader_run_info",
      Map<string, number>(),
    );
    const key = student_id ? `${assignment_id}-${student_id}` : assignment_id;
    nbgrader_run_info = nbgrader_run_info.delete(key);
    this.course_actions.setState({ nbgrader_run_info });
  };

  export_file_use_times = async (
    assignment_id: string,
    json_filename: string,
  ): Promise<void> => {
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
      store.get_student_name.bind(store),
    );
  };

  export_collected = async (assignment_id: string): Promise<void> => {
    const set_activity = this.course_actions.set_activity.bind(
      this.course_actions,
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
      const export_path = join(base_export_path, src_path);

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
        activity,
      );

      redux.getProjectActions(project_id).open_directory(base_export_path);
    } catch (err) {
      this.course_actions.set_error(
        `Error exporting collected student files -- ${err}`,
      );
    } finally {
      set_activity({ id });
    }
  };
}
