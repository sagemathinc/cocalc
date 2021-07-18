/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// React libraries
import { Store, redux } from "../app-framework";
// CoCalc libraries
import { cmp, cmp_array, set } from "smc-util/misc";
import { DirectoryListingEntry } from "smc-util/types";
// Course Library
import { STEPS } from "./util";
import { Map, Set, List } from "immutable";
import { TypedMap, createTypedMap } from "../app-framework";
import { SITE_NAME } from "smc-util/theme";
// Upgrades
import * as project_upgrades from "./project-upgrades";
import { Datastore } from "../projects/actions";
import { StudentProjectFunctionality } from "./configuration/customize-student-project-functionality";

export const PARALLEL_DEFAULT = 5;
export const MAX_COPY_PARALLEL = 25;

import {
  AssignmentCopyStep,
  AssignmentStatus,
  SiteLicenseStrategy,
  UpgradeGoal,
} from "./types";

import { NotebookScores } from "../jupyter/nbgrader/autograde";

import { CourseActions } from "./actions";

export type TerminalCommandOutput = TypedMap<{
  project_id: string;
  stdout?: string;
  stderr?: string;
}>;

export type TerminalCommand = TypedMap<{
  input?: string;
  output?: List<TerminalCommandOutput>;
  running?: boolean;
}>;

export type StudentRecord = TypedMap<{
  create_project: number; // Time the student project was created
  account_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  last_active: number;
  hosting: string;
  email_address: string;
  project_id: string;
  deleted: boolean;
  note: string;
  last_email_invite: number;
}>;

export type StudentsMap = Map<string, StudentRecord>;

export type LastCopyInfo = {
  time?: number;
  error?: string;
  start?: number;
};

export type AssignmentRecord = TypedMap<{
  assignment_id: string;
  deleted: boolean;
  due_date: Date;
  path: string;
  peer_grade?: {
    enabled: boolean;
    due_date: number;
    map: { [student_id: string]: string[] }; // map from student_id to *who* will grade that student
  };
  note: string;

  last_assignment?: { [student_id: string]: LastCopyInfo };
  last_collect?: { [student_id: string]: LastCopyInfo };
  last_peer_assignment?: { [student_id: string]: LastCopyInfo };
  last_peer_collect?: { [student_id: string]: LastCopyInfo };
  last_return_graded?: { [student_id: string]: LastCopyInfo };

  skip_assignment: boolean;
  skip_collect: boolean;
  skip_grading: boolean;
  target_path: string;
  collect_path: string;
  graded_path: string;

  nbgrader?: boolean; // if true, probably includes at least one nbgrader ipynb file
  listing?: DirectoryListingEntry[];

  grades?: { [student_id: string]: string };
  comments?: { [student_id: string]: string };
  nbgrader_scores?: {
    [student_id: string]: { [ipynb: string]: NotebookScores | string };
  };
  nbgrader_score_ids?: { [ipynb: string]: string[] };
}>;

export type AssignmentsMap = Map<string, AssignmentRecord>;

export type HandoutRecord = TypedMap<{
  deleted: boolean;
  handout_id: string;
  target_path: string;
  path: string;
  note: string;
  status: { [student_id: string]: LastCopyInfo };
}>;

export type HandoutsMap = Map<string, HandoutRecord>;

export type SortDescription = TypedMap<{
  column_name: string;
  is_descending: boolean;
}>;

export type CourseSettingsRecord = TypedMap<{
  allow_collabs: boolean;
  student_project_functionality?: StudentProjectFunctionality;
  description: string;
  email_invite: string;
  institute_pay: boolean;
  pay: string | Date;
  shared_project_id: string;
  student_pay: boolean;
  title: string;
  upgrade_goal: Map<any, any>;
  site_license_id?: string;
  site_license_strategy?: SiteLicenseStrategy;
  copy_parallel?: number;
  nbgrader_grade_in_instructor_project?: boolean; // deprecated
  nbgrader_grade_project?: string;
  nbgrader_include_hidden_tests?: boolean;
  nbgrader_cell_timeout_ms?: number;
  nbgrader_timeout_ms?: number;
  nbgrader_max_output?: number;
  nbgrader_max_output_per_cell?: number;
  nbgrader_parallel?: number;
}>;

export const CourseSetting = createTypedMap<CourseSettingsRecord>();

export type IsGradingMap = Map<string, boolean>;

export type ActivityMap = Map<number, string>;

// This NBgraderRunInfo is a map from what nbgrader task is running
// to when it was started (ms since epoch).  The keys are as follows:
//     36-character [account_id] = means that entire assignment with that id is being graded
//     [account_id]-[student_id] = the particular assignment for that student is being graded
// We do not track grading of individual files in an assignment.
// This is NOT sync'd across users, since that would increase network traffic and
// is probably not critical to do, since the worst case scenario is just running nbgrader
// more than once at the same time, which is probably just *inefficient*.
export type NBgraderRunInfo = Map<string, number>;

export interface CourseState {
  activity: ActivityMap;
  action_all_projects_state: string;
  active_student_sort: { column_name: string; is_descending: boolean };
  active_assignment_sort: { column_name: string; is_descending: boolean };
  assignments: AssignmentsMap;
  course_filename: string;
  course_project_id: string;
  configuring_projects?: boolean;
  error?: string;
  expanded_students: Set<string>;
  expanded_assignments: Set<string>;
  expanded_peer_configs: Set<string>;
  expanded_handouts: Set<string>;
  expanded_skip_gradings: Set<string>;
  active_feedback_edits: IsGradingMap;
  handouts: HandoutsMap;
  loading: boolean; // initially loading the syncdoc from disk.
  saving: boolean;
  settings: CourseSettingsRecord;
  show_save_button: boolean;
  students: StudentsMap;
  unsaved?: boolean;
  terminal_command?: TerminalCommand;
  nbgrader_run_info?: NBgraderRunInfo;
}

export class CourseStore extends Store<CourseState> {
  private assignment_status_cache?: {
    [assignment_id: string]: AssignmentStatus;
  };
  private handout_status_cache?: {
    [key: string]: { handout: number; not_handout: number };
  };

  // Return true if there are any non-deleted assignments that use peer grading
  public any_assignment_uses_peer_grading(): boolean {
    for (const [, assignment] of this.get_assignments()) {
      if (
        assignment.getIn(["peer_grade", "enabled"]) &&
        !assignment.get("deleted")
      ) {
        return true;
      }
    }
    return false;
  }

  // Return Javascript array of the student_id's of the students
  // that graded the given student, or undefined if no relevant assignment.
  public get_peers_that_graded_student(
    assignment_id: string,
    student_id: string
  ): string[] {
    const peers: string[] = [];
    const assignment = this.get_assignment(assignment_id);
    if (assignment == null) return peers;
    const map = assignment.getIn(["peer_grade", "map"]);
    if (map == null) {
      return peers;
    }
    for (const [other_student_id, who_grading] of map) {
      if (who_grading.includes(student_id)) {
        peers.push(other_student_id as string); // typescript thinks it could be a number?
      }
    }
    return peers;
  }

  public get_shared_project_id(): string | undefined {
    // return project_id (a string) if shared project has been created,
    // or undefined or empty string otherwise.
    return this.getIn(["settings", "shared_project_id"]);
  }

  public get_pay(): string | Date {
    const settings = this.get("settings");
    if (settings == null || !settings.get("student_pay")) return "";
    const pay = settings.get("pay");
    if (!pay) return "";
    return pay;
  }

  public get_datastore(): Datastore {
    const settings = this.get("settings");
    if (settings == null || settings.get("datastore") == null) return undefined;
    const ds = settings.get("datastore");
    if (typeof ds === "boolean" || Array.isArray(ds)) {
      return ds;
    } else {
      console.warn(`course/get_datastore: encountered faulty value:`, ds);
      return undefined;
    }
  }

  public get_allow_collabs(): boolean {
    return !!this.getIn(["settings", "allow_collabs"]);
  }

  public get_email_invite(): string {
    const invite = this.getIn(["settings", "email_invite"]);
    if (invite) return invite;
    const site_name = redux.getStore("customize").get("site_name") ?? SITE_NAME;
    return `Hello!\n\nWe will use ${site_name} for the course *{title}*.\n\nPlease sign up!\n\n--\n\n{name}`;
  }

  public get_students(): StudentsMap {
    return this.get("students");
  }

  // Return the student's name as a string, using a
  // bunch of heuristics to try to present the best
  // reasonable name, given what we know.  For example,
  // it uses an instructor-given custom name if it was set.
  public get_student_name(student_id: string): string {
    const { student } = this.resolve({ student_id });
    if (student == null) {
      // Student does not exist at all in store -- this shouldn't happen
      return "Unknown Student";
    }
    // Try instructor assigned name:
    if (student.get("first_name")?.trim() || student.get("last_name")?.trim()) {
      return [
        student.get("first_name", "")?.trim(),
        student.get("last_name", "")?.trim(),
      ].join(" ");
    }
    const account_id = student.get("account_id");
    if (account_id == null) {
      // Student doesn't have an account yet on CoCalc (that we know about).
      // Email address:
      if (student.has("email_address")) {
        return student.get("email_address");
      }
      // One of the above had to work, since we add students by email or account.
      // But put this in anyways:
      return "Unknown Student";
    }
    // Now we have a student with a known CoCalc account.
    // We would have returned early above if there was an instructor assigned name,
    // so we just return their name from cocalc, if known.
    const users = this.redux.getStore("users");
    if (users == null) throw Error("users must be defined");
    const name = users.get_name(account_id);
    if (name?.trim()) return name;
    // This situation usually shouldn't happen, but maybe could in case the user was known but
    // then removed themselves as a collaborator, or something else odd.
    if (student.has("email_address")) {
      return student.get("email_address");
    }
    // OK, now there is really no way to identify this student.  I suppose this could
    // happen if the student was added by searching for their name, then they removed
    // themselves.  Nothing useful we can do at this point.
    return "Unknown Student";
  }

  // Returns student name as with get_student_name above,
  // but also include an email address in angle braces,
  // if one is known in a full version of the name.
  // This is purely meant to provide a bit of extra info
  // for the instructor, and not actually used to send emails.
  public get_student_name_extra(student_id: string): {
    simple: string;
    full: string;
  } {
    const { student } = this.resolve({ student_id });
    if (student == null) {
      return { simple: "Unknown", full: "Unknown Student" };
    }
    const email = student.get("email_address");
    const simple = this.get_student_name(student_id);
    let extra: string = "";
    if (
      (student.has("first_name") || student.has("last_name")) &&
      student.has("account_id")
    ) {
      const users = this.redux.getStore("users");
      if (users != null) {
        const name = users.get_name(student.get("account_id"));
        if (name != null) {
          extra = ` (You call them "${student.has("first_name")} ${student.has(
            "last_name"
          )}", but they call themselves "${name}".)`;
        }
      }
    }
    return { simple, full: email ? `${simple} <${email}>${extra}` : simple };
  }

  // Return a name that should sort in a sensible way in
  // alphabetical order.  This is mainly used for CSV export,
  // and is not something that will ever get looked at.
  public get_student_sort_name(student_id: string): string {
    const { student } = this.resolve({ student_id });
    if (student == null) {
      return student_id; // keeps the sort stable
    }
    if (student.has("first_name") || student.has("last_name")) {
      return [student.get("last_name", ""), student.get("first_name", "")].join(
        " "
      );
    }
    const account_id = student.get("account_id");
    if (account_id == null) {
      if (student.has("email_address")) {
        return student.get("email_address");
      }
      return student_id;
    }
    const users = this.redux.getStore("users");
    if (users == null) return student_id;
    return [
      users.get_last_name(account_id),
      users.get_first_name(account_id),
    ].join(" ");
  }

  public get_student_email(student_id: string): string {
    return this.getIn(["students", student_id, "email_address"], "");
  }

  public get_student_ids(opts: { deleted?: boolean } = {}): string[] {
    const v: string[] = [];
    opts.deleted = !!opts.deleted;
    for (const [student_id, val] of this.get("students")) {
      if (!!val.get("deleted") == opts.deleted) {
        v.push(student_id);
      }
    }
    return v;
  }

  // return list of all student projects
  public get_student_project_ids(
    opts: {
      include_deleted?: boolean;
      deleted_only?: boolean;
    } = {}
  ): string[] {
    // include_deleted = if true, also include deleted projects
    // deleted_only = if true, only include deleted projects
    const { include_deleted, deleted_only } = opts;

    let v: string[] = [];

    for (const [, val] of this.get("students")) {
      const project_id: string = val.get("project_id");
      if (deleted_only) {
        if (include_deleted && val.get("deleted")) {
          v.push(project_id);
        }
      } else if (include_deleted) {
        v.push(project_id);
      } else if (!val.get("deleted")) {
        v.push(project_id);
      }
    }
    return v;
  }

  public get_student(student_id: string): StudentRecord | undefined {
    // return student with given id
    return this.getIn(["students", student_id]);
  }

  public get_student_project_id(student_id: string): string | undefined {
    return this.getIn(["students", student_id, "project_id"]);
  }

  // Return a Javascript array of immutable.js StudentRecord maps, sorted
  // by sort name (so first last name).
  public get_sorted_students(): StudentRecord[] {
    const v: StudentRecord[] = [];
    for (const [, student] of this.get("students")) {
      if (!student.get("deleted")) {
        v.push(student);
      }
    }
    v.sort((a, b) =>
      cmp(
        this.get_student_sort_name(a.get("student_id")),
        this.get_student_sort_name(b.get("student_id"))
      )
    );
    return v;
  }

  public get_grade(assignment_id: string, student_id: string): string {
    const { assignment } = this.resolve({ assignment_id });
    if (assignment == null) return "";
    const r = assignment.getIn(["grades", student_id], "");
    return r == null ? "" : r;
  }

  public get_nbgrader_scores(
    assignment_id: string,
    student_id: string
  ): { [ipynb: string]: NotebookScores | string } | undefined {
    const { assignment } = this.resolve({ assignment_id });
    return assignment?.getIn(["nbgrader_scores", student_id])?.toJS();
  }

  public get_nbgrader_score_ids(
    assignment_id: string
  ): { [ipynb: string]: string[] } | undefined {
    const { assignment } = this.resolve({ assignment_id });
    const ids = assignment?.get("nbgrader_score_ids")?.toJS();
    if (ids != null) return ids;
    // TODO: If the score id's aren't known, it would be nice to try
    // to parse the master ipynb file and compute them.  We still
    // allow for the possibility that this fails and return undefined
    // in that case.  This is painful since it involves async calls
    // to the backend, and the code that does this as part of grading
    // is deep inside other functions...
  }

  public get_comments(assignment_id: string, student_id: string): string {
    const { assignment } = this.resolve({ assignment_id });
    if (assignment == null) return "";
    const r = assignment.getIn(["comments", student_id], "");
    return r == null ? "" : r;
  }

  public get_due_date(assignment_id: string): Date | undefined {
    const { assignment } = this.resolve({ assignment_id });
    if (assignment == null) return;
    const due_date = assignment.get("due_date");
    if (due_date != null) {
      return new Date(due_date);
    }
  }

  public get_assignments(): AssignmentsMap {
    return this.get("assignments");
  }

  public get_sorted_assignments(): AssignmentRecord[] {
    const v: AssignmentRecord[] = [];
    for (const [, assignment] of this.get_assignments()) {
      if (!assignment.get("deleted")) {
        v.push(assignment);
      }
    }
    const f = function (a: AssignmentRecord) {
      return [a.get("due_date", 0), a.get("path", "")];
    };
    v.sort((a, b) => cmp_array(f(a), f(b)));
    return v;
  }

  // return assignment with given id if a string; otherwise, just return
  // the latest version of the assignment as stored in the store.
  public get_assignment(assignment_id: string): AssignmentRecord | undefined {
    return this.getIn(["assignments", assignment_id]);
  }

  // if deleted is true return only deleted assignments
  public get_assignment_ids(opts: { deleted?: boolean } = {}): string[] {
    const v: string[] = [];
    for (const [assignment_id, val] of this.get_assignments()) {
      if (!!val.get("deleted") == opts.deleted) {
        v.push(assignment_id);
      }
    }
    return v;
  }

  private num_nondeleted(a): number {
    let n: number = 0;
    for (const [, x] of a) {
      if (!x.get("deleted")) {
        n += 1;
      }
    }
    return n;
  }

  // number of non-deleted students
  public num_students(): number {
    return this.num_nondeleted(this.get_students());
  }

  // number of student projects that are currently running
  public num_running_projects(project_map): number {
    let n = 0;
    for (const [, student] of this.get_students()) {
      if (!student.get("deleted")) {
        if (
          project_map.getIn([student.get("project_id"), "state", "state"]) ==
          "running"
        ) {
          n += 1;
        }
      }
    }
    return n;
  }

  // number of non-deleted assignments
  public num_assignments(): number {
    return this.num_nondeleted(this.get_assignments());
  }

  // number of non-deleted handouts
  public num_handouts(): number {
    return this.num_nondeleted(this.get_handouts());
  }

  // get info about relation between a student and a given assignment
  public student_assignment_info(
    student_id: string,
    assignment_id: string
  ): {
    last_assignment?: LastCopyInfo;
    last_collect?: LastCopyInfo;
    last_peer_assignment?: LastCopyInfo;
    last_peer_collect?: LastCopyInfo;
    last_return_graded?: LastCopyInfo;
    student_id: string;
    assignment_id: string;
    peer_assignment: boolean;
    peer_collect: boolean;
  } {
    const { assignment } = this.resolve({ assignment_id });
    if (assignment == null) {
      return {
        student_id,
        assignment_id,
        peer_assignment: false,
        peer_collect: false,
      };
    }

    const status = this.get_assignment_status(assignment_id);
    if (status == null) throw Error("bug"); // can't happen

    // Important to return undefined if no info -- assumed in code
    function get_info(field: string): undefined | LastCopyInfo {
      if (assignment == null) throw Error("bug"); // can't happen
      const x = assignment.getIn([field, student_id]);
      if (x == null) return;
      return (x as any).toJS();
    }

    const peer_assignment =
      status.not_collect + status.not_assignment == 0 && status.collect != 0;
    const peer_collect =
      status.not_peer_assignment != null && status.not_peer_assignment == 0;

    return {
      last_assignment: get_info("last_assignment"),
      last_collect: get_info("last_collect"),
      last_peer_assignment: get_info("last_peer_assignment"),
      last_peer_collect: get_info("last_peer_collect"),
      last_return_graded: get_info("last_return_graded"),
      student_id,
      assignment_id,
      peer_assignment,
      peer_collect,
    };
  }

  // Return true if the assignment was copied to/from the
  // student, in the given step of the workflow.
  // Even an attempt to copy with an error counts,
  // unless no_error is true, in which case it doesn't.
  public last_copied(
    step: AssignmentCopyStep,
    assignment_id: string,
    student_id: string,
    no_error?: boolean
  ): boolean {
    const x = this.getIn([
      "assignments",
      assignment_id,
      `last_${step}`,
      student_id,
    ]);
    if (x == null) {
      return false;
    }
    const y: TypedMap<LastCopyInfo> = x;
    if (no_error && y.get("error")) {
      return false;
    }
    return y.get("time") != null;
  }

  public has_grade(assignment_id: string, student_id: string): boolean {
    return !!this.getIn(["assignments", assignment_id, "grades", student_id]);
  }

  public get_assignment_status(
    assignment_id: string
  ): AssignmentStatus | undefined {
    //
    // Compute and return an object that has fields (deleted students are ignored)
    //
    //  assignment          - number of students who have received assignment includes
    //                        all students if skip_assignment is true
    //  not_assignment      - number of students who have NOT received assignment
    //                        always 0 if skip_assignment is true
    //  collect             - number of students from whom we have collected assignment includes
    //                        all students if skip_collect is true
    //  not_collect         - number of students from whom we have NOT collected assignment but we sent it to them
    //                        always 0 if skip_assignment is true
    //  peer_assignment     - number of students who have received peer assignment
    //                        (only present if peer grading enabled; similar for peer below)
    //  not_peer_assignment - number of students who have NOT received peer assignment
    //  peer_collect        - number of students from whom we have collected peer grading
    //  not_peer_collect    - number of students from whome we have NOT collected peer grading
    //  return_graded       - number of students to whom we've returned assignment
    //  not_return_graded   - number of students to whom we've NOT returned assignment
    //                        but we collected it from them *and* either assigned a grade or skip grading
    //
    // This function caches its result and only recomputes values when the store changes,
    // so it should be safe to call in render.
    //
    if (this.assignment_status_cache == null) {
      this.assignment_status_cache = {};
      this.on("change", () => {
        // clear cache on any change to the store
        this.assignment_status_cache = {};
      });
    }
    const { assignment } = this.resolve({ assignment_id });
    if (assignment == null) {
      return;
    }

    if (this.assignment_status_cache[assignment_id] != null) {
      // we have cached info
      return this.assignment_status_cache[assignment_id];
    }

    const students: string[] = this.get_student_ids({ deleted: false });

    // Is peer grading enabled?
    const peer: boolean = assignment.getIn(["peer_grade", "enabled"], false);
    const skip_grading: boolean = assignment.get("skip_grading", false);

    const obj: any = {};
    for (const t of STEPS(peer)) {
      obj[t] = 0;
      obj[`not_${t}`] = 0;
    }
    const info: AssignmentStatus = obj;
    for (const student_id of students) {
      let previous: boolean = true;
      for (const t of STEPS(peer)) {
        const x = assignment.getIn([`last_${t}`, student_id]) as
          | undefined
          | TypedMap<LastCopyInfo>;
        if (
          (x != null && !x.get("error") && !x.get("start")) ||
          assignment.get(`skip_${t}`)
        ) {
          previous = true;
          info[t] += 1;
        } else {
          // add 1 only if the previous step *was* done (and in
          // the case of returning, they have a grade)
          const graded =
            this.has_grade(assignment_id, student_id) || skip_grading;
          if ((previous && t !== "return_graded") || graded) {
            info[`not_${t}`] += 1;
          }
          previous = false;
        }
      }
    }

    this.assignment_status_cache[assignment_id] = info;
    return info;
  }

  public get_handouts(): HandoutsMap {
    return this.get("handouts");
  }

  public get_handout(handout_id: string): HandoutRecord | undefined {
    return this.getIn(["handouts", handout_id]);
  }

  public get_handout_ids(opts: { deleted?: boolean } = {}): string[] {
    const v: string[] = [];
    for (const [handout_id, val] of this.get_handouts()) {
      if (!!val.get("deleted") == opts.deleted) {
        v.push(handout_id);
      }
    }
    return v;
  }

  public student_handout_info(
    student_id: string,
    handout_id: string
  ): { status?: LastCopyInfo; handout_id: string; student_id: string } {
    // status -- important to be undefined if no info -- assumed in code
    const status = this.getIn(["handouts", handout_id, "status", student_id]);
    return {
      status: status != null ? status.toJS() : undefined,
      student_id,
      handout_id,
    };
  }

  // Return the last time the handout was copied to/from the
  // student (in the given step of the workflow), or undefined.
  // Even an attempt to copy with an error counts.
  public handout_last_copied(handout_id: string, student_id: string): boolean {
    const x = this.getIn(["handouts", handout_id, "status", student_id]) as
      | TypedMap<LastCopyInfo>
      | undefined;
    if (x == null) {
      return false;
    }
    if (x.get("error")) {
      return false;
    }
    return x.get("time") != null;
  }

  public get_handout_status(
    handout_id: string
  ): undefined | { handout: number; not_handout: number } {
    //
    // Compute and return an object that has fields (deleted students are ignored)
    //
    //  handout     - number of students who have received handout
    //  not_handout - number of students who have NOT received handout
    // This function caches its result and only recomputes values when the store changes,
    // so it should be safe to call in render.
    //
    if (this.handout_status_cache == null) {
      this.handout_status_cache = {};
      this.on("change", () => {
        // clear cache on any change to the store
        this.handout_status_cache = {};
      });
    }
    const { handout } = this.resolve({ handout_id });
    if (handout == null) {
      return undefined;
    }

    if (this.handout_status_cache[handout_id] != null) {
      return this.handout_status_cache[handout_id];
    }

    const students: string[] = this.get_student_ids({ deleted: false });

    const info = {
      handout: 0,
      not_handout: 0,
    };

    const status = handout.get("status");
    for (const student_id of students) {
      if (status == null) {
        info.not_handout += 1;
      } else {
        const x = status.get(student_id);
        if (x != null && !x.get("error")) {
          info.handout += 1;
        } else {
          info.not_handout += 1;
        }
      }
    }

    this.handout_status_cache[handout_id] = info;
    return info;
  }

  public get_upgrade_plan(upgrade_goal: UpgradeGoal) {
    const account_store: any = this.redux.getStore("account");
    const project_map = this.redux.getStore("projects").get("project_map");
    if (project_map == null) throw Error("not fully loaded");
    const plan = project_upgrades.upgrade_plan({
      account_id: account_store.get_account_id(),
      purchased_upgrades: account_store.get_total_upgrades(),
      project_map,
      student_project_ids: set(
        this.get_student_project_ids({
          include_deleted: true,
        })
      ),
      deleted_project_ids: set(
        this.get_student_project_ids({
          include_deleted: true,
          deleted_only: true,
        })
      ),
      upgrade_goal,
    });
    return plan;
  }

  private resolve(opts: {
    assignment_id?: string;
    student_id?: string;
    handout_id?: string;
  }): {
    student?: StudentRecord;
    assignment?: AssignmentRecord;
    handout?: HandoutRecord;
  } {
    const actions = this.redux.getActions(this.name);
    if (actions == null) return {};
    const x = (actions as CourseActions).resolve(opts);
    delete (x as any).store;
    return x;
  }

  // List of ids of (non-deleted) assignments that have been
  // assigned to at least one student.
  public get_assigned_assignment_ids(): string[] {
    const v: string[] = [];
    for (const [assignment_id, val] of this.get_assignments()) {
      if (val.get("deleted")) continue;
      const x = val.get(`last_assignment`);
      if (x != null && x.size > 0) {
        v.push(assignment_id);
      }
    }
    return v;
  }

  // List of ids of (non-deleted) handouts that have been copied
  // out to at least one student.
  public get_assigned_handout_ids(): string[] {
    const v: string[] = [];
    for (const [handout_id, val] of this.get_handouts()) {
      if (val.get("deleted")) continue;
      const x = val.get(`status`);
      if (x != null && x.size > 0) {
        v.push(handout_id);
      }
    }
    return v;
  }

  public get_copy_parallel(): number {
    const n = this.getIn(["settings", "copy_parallel"]) ?? PARALLEL_DEFAULT;
    if (n < 1) return 1;
    if (n > MAX_COPY_PARALLEL) return MAX_COPY_PARALLEL;
    return n;
  }

  public get_nbgrader_parallel(): number {
    const n = this.getIn(["settings", "nbgrader_parallel"]) ?? PARALLEL_DEFAULT;
    if (n < 1) return 1;
    if (n > 50) return 50;
    return n;
  }
}

export function get_nbgrader_score(scores: {
  [ipynb: string]: NotebookScores | string;
}): { score: number; points: number; error?: boolean; manual_needed: boolean } {
  let points: number = 0;
  let score: number = 0;
  let error: boolean = false;
  let manual_needed: boolean = false;
  for (const ipynb in scores) {
    const x = scores[ipynb];
    if (typeof x == "string") {
      error = true;
      continue;
    }
    for (const grade_id in x) {
      const y = x[grade_id];
      if (y.score == null && y.manual) {
        manual_needed = true;
      }
      if (y.score) {
        score += y.score;
      }
      points += y.points;
    }
  }
  return { score, points, error, manual_needed };
}
