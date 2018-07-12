/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

// React libraries
import { Store } from "../app-framework";

// SMC libraries
const misc = require("smc-util/misc");
const { defaults } = misc;

// Course Library
import { STEPS } from "./util";
import { Map, Set } from "immutable";
import { TypedMap } from "../app-framework/TypedMap";

// Upgrades
const project_upgrades = require("./project-upgrades");

export type StudentRecord = TypedMap<{
  create_project: number; // Time the student project was created
  account_id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  last_active: number;
  hosting: boolean;
  email_address: string;
  project_id: string;
  deleted: boolean;
  note: string;
}>;

export type StudentsMap = Map<string, StudentRecord>

export type AssignmentRecord = TypedMap<{
  assignment_id: string;
  deleted: boolean;
  due_date: Date;
  path: string;
  peer_grade: boolean;
  note: string;
  last_assignment: string;
  skip_assignment: boolean;
  skip_collect: boolean;
  skip_grading: boolean;
}>;

export type AssignmentsMap = Map<string, AssignmentRecord>

export type HandoutRecord = TypedMap<{
  deleted: boolean;
  handout_id: string;
  target_path: string;
  path: string;
  note: string;
}>;

export type HandoutsMap = Map<string, HandoutRecord>

export type SortDescription = TypedMap<{
  column_name: string;
  is_descending: boolean;
}>;

export type CourseSettingsRecord = TypedMap<{
  allow_collabs: boolean;
  description: string;
  email_invite: string;
  institute_pay: boolean;
  pay: string | number | Date;
  shared_project_id: string;
  student_pay: boolean;
  title: string;
  upgrade_goal: Map<any, any>;
}>;

export interface CourseState {
  activity: { [key: string]: string };
  action_all_projects_state: string;
  active_student_sort: { column_name: string; is_descending: boolean };
  active_assignment_sort: { column_name: string; is_descending: boolean };
  assignments: AssignmentsMap;
  course_filename: string;
  course_project_id: string;
  configure_projects: string;
  error: string;
  expanded_students: Set<string>;
  expanded_assignments: Set<string>;
  expanded_peer_configs: Set<string>;
  expanded_handouts: Set<string>;
  expanded_skip_gradings: Set<string>;
  handouts: HandoutsMap;
  saving: boolean;
  settings: CourseSettingsRecord;
  show_save_button: boolean;
  student_id: string;
  students: StudentsMap;
  tab: string;
  unsaved: boolean;
}

export class CourseStore extends Store<CourseState> {
  private _assignment_status: { [key: string]: string };
  private _handout_status: {
    [key: string]: { handout: number; not_handout: number };
  };
  constructor(a, b) {
    super(a, b);
    this.any_assignment_uses_peer_grading = this.any_assignment_uses_peer_grading.bind(
      this
    );
    this.get_peers_that_student_will_grade = this.get_peers_that_student_will_grade.bind(
      this
    );
    this.get_peers_that_graded_student = this.get_peers_that_graded_student.bind(
      this
    );
    this.get_shared_project_id = this.get_shared_project_id.bind(this);
    this.get_pay = this.get_pay.bind(this);
    this.get_allow_collabs = this.get_allow_collabs.bind(this);
    this.get_email_invite = this.get_email_invite.bind(this);
    this.get_activity = this.get_activity.bind(this);
    this.get_students = this.get_students.bind(this);
    this.get_student_name = this.get_student_name.bind(this);
    this.get_student_email = this.get_student_email.bind(this);
    this.get_student_ids = this.get_student_ids.bind(this);
    this.get_student_project_ids = this.get_student_project_ids.bind(this);
    this.get_student = this.get_student.bind(this);
    this.get_student_note = this.get_student_note.bind(this);
    this.get_student_project_id = this.get_student_project_id.bind(this);
    this.get_sorted_students = this.get_sorted_students.bind(this);
    this.get_grade = this.get_grade.bind(this);
    this.get_comments = this.get_comments.bind(this);
    this.get_due_date = this.get_due_date.bind(this);
    this.get_assignment_note = this.get_assignment_note.bind(this);
    this.get_assignments = this.get_assignments.bind(this);
    this.get_sorted_assignments = this.get_sorted_assignments.bind(this);
    this.get_assignment = this.get_assignment.bind(this);
    this.get_assignment_ids = this.get_assignment_ids.bind(this);
    this._num_nondeleted = this._num_nondeleted.bind(this);
    this.num_students = this.num_students.bind(this);
    this.num_running_projects = this.num_running_projects.bind(this);
    this.num_assignments = this.num_assignments.bind(this);
    this.num_handouts = this.num_handouts.bind(this);
    this.student_assignment_info = this.student_assignment_info.bind(this);
    this.last_copied = this.last_copied.bind(this);
    this.has_grade = this.has_grade.bind(this);
    this.get_assignment_status = this.get_assignment_status.bind(this);
    this.get_handout_note = this.get_handout_note.bind(this);
    this.get_handouts = this.get_handouts.bind(this);
    this.get_handout = this.get_handout.bind(this);
    this.get_handout_ids = this.get_handout_ids.bind(this);
    this.student_handout_info = this.student_handout_info.bind(this);
    this.handout_last_copied = this.handout_last_copied.bind(this);
    this.get_handout_status = this.get_handout_status.bind(this);
    this.get_upgrade_plan = this.get_upgrade_plan.bind(this);
  }

  any_assignment_uses_peer_grading() {
    // Return true if there are any non-deleted assignments that use peer grading
    let has_peer = false;
    this.get_assignments().forEach((assignment, _) => {
      if (
        assignment.getIn(["peer_grade", "enabled"]) &&
        !assignment.get("deleted")
      ) {
        has_peer = true;
        return false;
      }
    }); // stop looping
    return has_peer;
  }

  get_peers_that_student_will_grade(assignment, student) {
    // Return the peer assignment for grading of the given assignment for the given student,
    // if such an assignment has been made.  If not, returns undefined.
    // In particular, this returns a Javascript array of student_id's.
    assignment = this.get_assignment(assignment);
    student = this.get_student(student);
    return __guard__(
      __guard__(assignment.getIn(["peer_grade", "map"]), x1 =>
        x1.get(student.get("student_id"))
      ),
      x => x.toJS()
    );
  }

  get_peers_that_graded_student(assignment, student) {
    // Return Javascript array of the student_id's of the students
    // that graded the given student, or undefined if no relevant assignment.
    assignment = this.get_assignment(assignment);
    const map = assignment.getIn(["peer_grade", "map"]);
    if (map == null) {
      return;
    }
    student = this.get_student(student);
    const id = student.get("student_id");
    return (() => {
      const result: string[] = [];
      const object = map.toJS();
      for (let student_id in object) {
        const who_grading = object[student_id];
        if (who_grading.includes(id)) {
          result.push(student_id);
        }
      }
      return result;
    })();
  }

  get_shared_project_id() {
    // return project_id (a string) if shared project has been created, or undefined or empty string otherwise.
    return this.get("settings").get("shared_project_id");
  }

  get_pay() {
    let left;
    return (left = this.get("settings").get("pay")) != null ? left : "";
  }

  get_allow_collabs() {
    let left;
    return (left = this.get("settings").get("allow_collabs")) != null
      ? left
      : true;
  }

  get_email_invite() {
    let left;
    const { SITE_NAME, DOMAIN_NAME } = require("smc-util/theme");
    return (left = this.get("settings").get("email_invite")) != null
      ? left
      : `We will use [${SITE_NAME}](${DOMAIN_NAME}) for the course *{title}*.  \n\nPlease sign up!\n\n--\n\n{name}`;
  }

  get_activity() {
    return this.get("activity");
  }

  get_students() {
    return this.get("students");
  }

  // Get the student's name.
  // Uses an instructor-given name if it exists.
  get_student_name(student, include_email = false) {
    let full, full_name, left, left1, simple;
    student = this.get_student(student);
    if (student == null) {
      return "student";
    }
    const email = student.get("email_address");
    const account_id = student.get("account_id");
    const first_name =
      (left = student.get("first_name")) != null
        ? left
        : this.redux.getStore("users").get_first_name(account_id);
    const last_name =
      (left1 = student.get("last_name")) != null
        ? left1
        : this.redux.getStore("users").get_last_name(account_id);
    if (first_name != null && last_name != null) {
      full_name = first_name + " " + last_name;
    } else if (first_name != null) {
      full_name = first_name;
    } else if (last_name != null) {
      full_name = last_name;
    } else {
      full_name = email != null ? email : "student";
    }
    if (include_email && full_name != null && email != null) {
      full = full_name + ` <${email}>`;
    } else {
      full = full_name;
    }
    if (full_name === "Unknown User" && email != null) {
      full_name = email;
    }
    if (!include_email) {
      return full_name;
    }
    try {
      JSON.stringify(full_name);
      simple = full_name;
    } catch (error) {
      simple = full_name.replace(/\W/g, " ");
    }
    return { simple, full };
  }

  get_student_email(student) {
    student = this.get_student(student);
    if (student == null) {
      return "student";
    }
    return student.get("email_address");
  }

  get_student_ids(opts?) {
    opts = defaults(opts, { deleted: false });
    if (this.get("students") == null) {
      return;
    }
    const v: string[] = [];
    this.get("students").map((val, student_id) => {
      if (!!val.get("deleted") === opts.deleted) {
        return v.push(student_id);
      }
    });
    return v;
  }

  // return list of all student projects (or undefined if not loaded)
  get_student_project_ids(opts?) {
    let include, v;
    const { include_deleted, deleted_only, map } = defaults(opts, {
      include_deleted: false,
      deleted_only: false,
      map: false
    }); // return as map to true/false instead of array
    // include_deleted = if true, also include deleted projects
    // deleted_only = if true, only include deleted projects
    if (this.get("students") == null) {
      return;
    }
    if (map) {
      v = {};
      include = x => (v[x] = true);
    } else {
      v = [];
      include = x => v.push(x);
    }
    this.get("students").map(val => {
      const id = val.get("project_id");
      if (deleted_only) {
        if (include_deleted && val.get("deleted")) {
          return include(id);
        }
      } else if (include_deleted) {
        return include(id);
      } else if (!val.get("deleted")) {
        return include(id);
      }
    });
    return v;
  }

  get_student(student) {
    // return student with given id if a string; otherwise, just return student (the input)
    if (typeof student !== "string") {
      student = student != null ? student.get("student_id") : undefined;
    }
    return this.getIn(["students", student]);
  }

  get_student_note(student) {
    return __guard__(this.get_student(student), x => x.get("note"));
  }

  get_student_project_id(student) {
    return __guard__(this.get_student(student), x => x.get("project_id"));
  }

  get_sorted_students() {
    const v: StudentRecord[] = [];
    this.get("students").map(student => {
      if (!student.get("deleted")) {
        return v.push(student);
      }
    });
    v.sort((a, b) =>
      misc.cmp(this.get_student_name(a), this.get_student_name(b))
    );
    return v;
  }

  get_grade(assignment, student) {
    return __guard__(
      __guard__(this.get_assignment(assignment), x1 => x1.get("grades")),
      x =>
        x.get(__guard__(this.get_student(student), x2 => x2.get("student_id")))
    );
  }

  get_comments(assignment, student) {
    return __guard__(
      __guard__(this.get_assignment(assignment), x1 => x1.get("comments")),
      x =>
        x.get(__guard__(this.get_student(student), x2 => x2.get("student_id")))
    );
  }

  get_due_date(assignment) {
    const due_date = __guard__(this.get_assignment(assignment), x =>
      x.get("due_date")
    );
    if (due_date != null) {
      return new Date(due_date);
    }
  }

  get_assignment_note(assignment) {
    return __guard__(this.get_assignment(assignment), x => x.get("note"));
  }

  get_assignments() {
    return this.get("assignments");
  }

  get_sorted_assignments() {
    const v: AssignmentRecord[] = [];
    this.get_assignments().map(assignment => {
      if (!assignment.get("deleted")) {
        return v.push(assignment);
      }
    });
    const f = function(a: AssignmentRecord) {
      let left;
      return [
        (left = a.get("due_date")) != null ? left : 0,
        __guard__(a.get("path"), x => x.toLowerCase())
      ];
    }; // note: also used in compute_assignment_list
    v.sort((a, b) => misc.cmp_array(f(a), f(b)));
    return v;
  }

  get_assignment(assignment) {
    // return assignment with given id if a string; otherwise, just return assignment (the input)
    if (typeof assignment !== "string") {
      assignment =
        assignment != null ? assignment.get("assignment_id") : undefined;
    }
    return this.getIn(["assignments", assignment]);
  }

  get_assignment_ids(opts) {
    opts = defaults(opts, { deleted: false }); // if true return only deleted assignments
    if (!this.get_assignments()) {
      return;
    }
    const v: string[] = [];
    this.get_assignments().map((val, assignment_id) => {
      if (!!val.get("deleted") === opts.deleted) {
        return v.push(assignment_id);
      }
    });
    return v;
  }

  _num_nondeleted(a) {
    if (a == null) {
      return;
    }
    let n = 0;
    a.map(val => {
      if (!val.get("deleted")) {
        return (n += 1);
      }
    });
    return n;
  }

  // number of non-deleted students
  num_students() {
    return this._num_nondeleted(this.get_students());
  }

  // number of student projects that are currently running
  num_running_projects(project_map) {
    let n = 0;
    __guard__(this.get_students(), x =>
      x.map(student => {
        if (!student.get("deleted")) {
          if (
            project_map.getIn([student.get("project_id"), "state", "state"]) ===
            "running"
          ) {
            return (n += 1);
          }
        }
      })
    );
    return n;
  }

  // number of non-deleted assignments
  num_assignments() {
    return this._num_nondeleted(this.get_assignments());
  }

  // number of non-deleted handouts
  num_handouts() {
    return this._num_nondeleted(this.get_handouts());
  }

  // get info about relation between a student and a given assignment
  student_assignment_info(student, assignment) {
    assignment = this.get_assignment(assignment);
    student = this.get_student(student);
    const student_id = student.get("student_id");
    const status = this.get_assignment_status(assignment);
    const info = {
      // RHS -- important to be undefined if no info -- assumed in code
      last_assignment: __guard__(
        __guard__(assignment.get("last_assignment"), x1 => x1.get(student_id)),
        x => x.toJS()
      ),
      last_collect: __guard__(
        __guard__(assignment.get("last_collect"), x3 => x3.get(student_id)),
        x2 => x2.toJS()
      ),
      last_peer_assignment: __guard__(
        __guard__(assignment.get("last_peer_assignment"), x5 =>
          x5.get(student_id)
        ),
        x4 => x4.toJS()
      ),
      last_peer_collect: __guard__(
        __guard__(assignment.get("last_peer_collect"), x7 =>
          x7.get(student_id)
        ),
        x6 => x6.toJS()
      ),
      last_return_graded: __guard__(
        __guard__(assignment.get("last_return_graded"), x9 =>
          x9.get(student_id)
        ),
        x8 => x8.toJS()
      ),
      student_id,
      assignment_id: assignment.get("assignment_id"),
      peer_assignment:
        status.not_collect + status.not_assignment === 0 &&
        status.collect !== 0,
      peer_collect:
        status.not_peer_assignment != null && status.not_peer_assignment === 0
    };
    return info;
  }

  // Return the last time the assignment was copied to/from the
  // student (in the given step of the workflow), or undefined.
  // Even an attempt to copy with an error counts.
  last_copied(step, assignment, student_id, no_error?) {
    const x = __guard__(
      __guard__(this.get_assignment(assignment), x2 => x2.get(`last_${step}`)),
      x1 => x1.get(student_id)
    );
    if (x == null) {
      return;
    }
    if (no_error && x.get("error")) {
      return;
    }
    return x.get("time");
  }

  has_grade(assignment, student_id) {
    return !!__guard__(
      __guard__(this.get_assignment(assignment), x1 => x1.get("grades")),
      x => x.get(student_id)
    );
  }

  get_assignment_status(assignment) {
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
    let left;
    if (this._assignment_status == null) {
      this._assignment_status = {};
      this.on("change", () => {
        // clear cache on any change to the store
        return (this._assignment_status = {});
      });
    }
    assignment = this.get_assignment(assignment);
    if (assignment == null) {
      return undefined;
    }

    const assignment_id = assignment.get("assignment_id");
    if (this._assignment_status[assignment_id] != null) {
      return this._assignment_status[assignment_id];
    }

    const students = this.get_student_ids({ deleted: false });
    if (students == null) {
      return undefined;
    }

    // Is peer grading enabled?
    const peer = __guard__(assignment.get("peer_grade"), x1 =>
      x1.get("enabled")
    );
    const skip_grading =
      (left = assignment.get("skip_grading")) != null ? left : false;

    // if DEBUG then console.log('get_assignment_status/assignment', assignment)

    const info: any = {};
    for (var t of STEPS(peer)) {
      info[t] = 0;
      info[`not_${t}`] = 0;
    }
    for (var student_id of students) {
      let previous = true;
      for (t of STEPS(peer)) {
        const x = __guard__(assignment.get(`last_${t}`), x2 =>
          x2.get(student_id)
        );
        if ((x != null && !x.get("error")) || assignment.get(`skip_${t}`)) {
          previous = true;
          info[t] += 1;
        } else {
          // add one only if the previous step *was* done (and in
          // the case of returning, they have a grade)
          const graded = this.has_grade(assignment, student_id) || skip_grading;
          if ((previous && t !== "return_graded") || graded) {
            info[`not_${t}`] += 1;
          }
          previous = false;
        }
      }
    }

    this._assignment_status[assignment_id] = info;
    return info;
  }

  get_handout_note(handout) {
    return __guard__(this.get_handout(handout), x => x.get("note"));
  }

  get_handouts() {
    return this.get("handouts");
  }

  get_handout(handout: string | HandoutRecord): HandoutRecord | undefined {
    // return handout with given id if a string; otherwise, just return handout (the input)
    if (typeof handout !== "string") {
      handout = handout.get("handout_id");
    }
    return this.get_handouts().get(handout);
  }

  get_handout_ids(opts) {
    opts = defaults(opts, { deleted: false }); // if true return only deleted handouts
    if (!this.get_handouts()) {
      return undefined;
    }
    const v: string[] = [];
    this.get_handouts().map((val, handout_id) => {
      if (!!val.get("deleted") === opts.deleted) {
        return v.push(handout_id);
      }
    });
    return v;
  }

  student_handout_info(student, handout) {
    handout = this.get_handout(handout);
    student = this.get_student(student);
    const student_id = student.get("student_id");
    const info = {
      // RHS -- important to be undefined if no info -- assumed in code
      status: __guard__(
        __guard__(handout.get("status"), x1 => x1.get(student_id)),
        x => x.toJS()
      ),
      student_id,
      handout_id: handout.get("handout_id")
    };
    return info;
  }

  // Return the last time the handout was copied to/from the
  // student (in the given step of the workflow), or undefined.
  // Even an attempt to copy with an error counts.
  // ???
  handout_last_copied(handout, student_id) {
    const x = __guard__(
      __guard__(this.get_handout(handout), x2 => x2.get("status")),
      x1 => x1.get(student_id)
    );
    if (x == null) {
      return undefined;
    }
    if (x.get("error")) {
      return undefined;
    }
    return x.get("time");
  }

  get_handout_status(handout) {
    //
    // Compute and return an object that has fields (deleted students are ignored)
    //
    //  handout     - number of students who have received handout
    //  not_handout - number of students who have NOT received handout
    // This function caches its result and only recomputes values when the store changes,
    // so it should be safe to call in render.
    //
    if (this._handout_status == null) {
      this._handout_status = {};
      this.on("change", () => {
        // clear cache on any change to the store
        return (this._handout_status = {});
      });
    }
    handout = this.get_handout(handout);
    if (handout == null) {
      return undefined;
    }

    const handout_id = handout.get("handout_id");
    if (this._handout_status[handout_id] != null) {
      return this._handout_status[handout_id];
    }

    const students = this.get_student_ids({ deleted: false });
    if (students == null) {
      return undefined;
    }

    const info = {
      handout: 0,
      not_handout: 0
    };

    for (var student_id of students) {
      const x = __guard__(handout.get("status"), x1 => x1.get(student_id));
      if (x != null && !x.get("error")) {
        info.handout += 1;
      } else {
        info.not_handout += 1;
      }
    }

    this._handout_status[handout_id] = info;
    return info;
  }

  get_upgrade_plan(upgrade_goal) {
    const account_store: any = this.redux.getStore("account");
    const plan = project_upgrades.upgrade_plan({
      account_id: account_store.get_account_id(),
      purchased_upgrades: account_store.get_total_upgrades(),
      project_map: this.redux.getStore("projects").get("project_map"),
      student_project_ids: this.get_student_project_ids({
        include_deleted: true,
        map: true
      }),
      deleted_project_ids: this.get_student_project_ids({
        include_deleted: true,
        deleted_only: true,
        map: true
      }),
      upgrade_goal
    });
    return plan;
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
