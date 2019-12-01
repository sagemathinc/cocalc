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

// Number of days to wait until re-inviting students via email.
// The user can always just click the "Reconfigure all projects" button in
// the Configuration page, and that always resends email invites.
export const EMAIL_REINVITE_DAYS = 6;

import { Map } from "immutable";

// CoCalc libraries
import { SyncDB } from "smc-util/sync/editor/db/sync";
import { SyncDBRecord, UpgradeGoal } from "./types";

// Course Library
import {
  CourseState,
  CourseStore,
  AssignmentRecord,
  StudentRecord,
  HandoutRecord
} from "./store";

import { Result } from "./student-projects/run-in-all-projects";
import { SharedProjectActions } from "./shared-project/actions";
import { ActivityActions } from "./activity/actions";
import { StudentsActions } from "./students/actions";
import { StudentProjectsActions } from "./student-projects/actions";
import { AssignmentsActions } from "./assignments/actions";
import { HandoutsActions } from "./handouts/actions";

// React libraries
import { Actions, TypedMap } from "../app-framework";

export const PARALLEL_LIMIT = 3; // number of async things to do in parallel

const primary_key = {
  students: "student_id",
  assignments: "assignment_id",
  handouts: "handout_id"
};

// Requires a syncdb to be set later
// Manages local and sync changes
export class CourseActions extends Actions<CourseState> {
  public syncdb: SyncDB;
  private last_collaborator_state: any;
  private activity: ActivityActions;
  public shared_project: SharedProjectActions;
  private students: StudentsActions;
  private student_projects: StudentProjectsActions;
  public assignments: AssignmentsActions;
  public handouts: HandoutsActions;
  private state: "init" | "ready" | "closed" = "init";

  constructor(name, redux) {
    super(name, redux);
    if (this.name == null || this.redux == null) {
      throw Error("BUG: name and redux must be defined");
    }

    this.shared_project = new SharedProjectActions(this);
    this.activity = new ActivityActions(this);
    this.students = new StudentsActions(this);
    this.student_projects = new StudentProjectsActions(this);
    this.assignments = new AssignmentsActions(this);
    this.handouts = new HandoutsActions(this);
  }

  public get_store(): CourseStore {
    const store = this.redux.getStore<CourseState, CourseStore>(this.name);
    if (store == null) throw Error("store is null");
    if (!this.store_is_initialized())
      throw Error("course store must be initialized");
    this.state = "ready"; // this is pretty dumb for now.
    return store;
  }

  public is_closed(): boolean {
    if (this.state == "closed") return true;
    const store = this.redux.getStore<CourseState, CourseStore>(this.name);
    if (store == null) {
      this.state = "closed";
      return true;
    }
    return false;
  }

  private is_loaded(): boolean {
    if (this.syncdb == null) {
      this.set_error("attempt to set syncdb before loading");
      return false;
    }
    return true;
  }

  private store_is_initialized(): boolean {
    const store = this.redux.getStore<CourseState, CourseStore>(this.name);
    if (store == null) {
      return false;
    }
    if (
      !(
        store.get("students") != null &&
        store.get("assignments") != null &&
        store.get("settings") != null &&
        store.get("handouts") != null
      )
    ) {
      return false;
    }
    return true;
  }

  // Set one object in the syncdb
  public set(obj: SyncDBRecord, commit: boolean = true): void {
    if (
      !this.is_loaded() ||
      (this.syncdb != null ? this.syncdb.get_state() === "closed" : undefined)
    ) {
      return;
    }
    this.syncdb.set(obj);
    if (commit) {
      this.syncdb.commit();
    }
  }

  // Get one object from this.syncdb as a Javascript object (or undefined)
  public get_one(obj: SyncDBRecord): SyncDBRecord | undefined {
    if (
      this.syncdb != null ? this.syncdb.get_state() === "closed" : undefined
    ) {
      return;
    }
    const x = this.syncdb.get_one(obj);
    if (x == null) return;
    return x.toJS();
  }

  public async save(): Promise<void> {
    const store = this.get_store();
    if (store == null) {
      return;
    } // e.g., if the course store object already gone due to closing course.
    if (store.get("saving")) {
      return; // already saving
    }
    const id = this.set_activity({ desc: "Saving..." });
    this.setState({ saving: true });
    try {
      await this.syncdb.save_to_disk();
      this.setState({ show_save_button: false });
    } catch (err) {
      this.set_error(`Error saving -- ${err}`);
      this.setState({ show_save_button: true });
      return;
    } finally {
      this.clear_activity(id);
      this.setState({ saving: false });
      this.update_unsaved_changes();
      setTimeout(this.update_unsaved_changes.bind(this), 1000);
    }
  }

  public syncdb_change(changes: TypedMap<SyncDBRecord>[]): void {
    let t;
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const cur = (t = store.getState());
    changes.map(obj => {
      const table = obj.get("table");
      if (table == null) {
        // no idea what to do with something that doesn't have table defined
        return;
      }
      const x = this.syncdb.get_one(obj);
      const key = primary_key[table];
      if (x == null) {
        // delete
        if (key != null) {
          t = t.set(table, t.get(table).delete(obj.get(key)));
        }
      } else {
        // edit or insert
        if (key != null) {
          t = t.set(table, t.get(table).set(x.get(key), x));
        } else if (table === "settings") {
          t = t.set(table, t.get(table).merge(x.delete("table")));
        } else {
          // no idea what to do with this
          console.warn(`unknown table '${table}'`);
        }
      }
    }); // ensure map doesn't terminate

    if (!cur.equals(t)) {
      // something definitely changed
      this.setState(t);
    }
    this.update_unsaved_changes();
  }

  private update_unsaved_changes(): void {
    if (this.syncdb == null) {
      return;
    }
    const unsaved = this.syncdb.has_unsaved_changes();
    this.setState({ unsaved });
  }

  // important that this be bound...
  public handle_projects_store_update(state: Map<string, any>): void {
    const store = this.redux.getStore<CourseState, CourseStore>(this.name);
    if (store == null) return; // not needed yet.
    let users = state.getIn([
      "project_map",
      store.get("course_project_id"),
      "users"
    ]);
    if (users == null) return;
    users = users.keySeq();
    if (this.last_collaborator_state == null) {
      this.last_collaborator_state = users;
      return;
    }
    if (!this.last_collaborator_state.equals(users)) {
      this.configure_all_projects();
    }
    this.last_collaborator_state = users;
  }

  // Set the error.  Use error="" to explicitly clear the existing set error.
  // If there is an error already set, then the new error is just
  // appended to the existing one.
  public set_error(error: string): void {
    if (error != "") {
      const store = this.get_store();
      if (store == null) return;
      if (store.get("error")) {
        error = `${store.get("error")} ${error}`;
      }
      error = error.trim();
    }
    this.setState({ error });
  }

  // ACTIVITY ACTIONS
  public set_activity(
    opts: { id: number; desc?: string } | { id?: number; desc: string }
  ): number {
    return this.activity.set_activity(opts);
  }

  public clear_activity(id?: number): void {
    this.activity.clear_activity(id);
  }

  // CONFIGURATION ACTIONS
  public set_title(title: string): void {
    this.set({ title, table: "settings" });
    this.student_projects.set_all_student_project_titles(title);
    this.shared_project.set_project_title();
  }

  public set_description(description: string): void {
    this.set({ description, table: "settings" });
    this.student_projects.set_all_student_project_descriptions(description);
    this.shared_project.set_project_description();
  }

  public set_pay_choice(type: string, value: boolean): void {
    this.set({ [type + "_pay"]: value, table: "settings" });
    if (type == "student") {
      if (value) {
        this.student_projects.set_all_student_project_course_info();
      } else {
        this.student_projects.set_all_student_project_course_info("");
      }
    }
  }

  public set_upgrade_goal(upgrade_goal: UpgradeGoal): void {
    this.set({ upgrade_goal, table: "settings" });
  }

  public set_allow_collabs(allow_collabs: boolean): void {
    this.set({ allow_collabs, table: "settings" });
    this.configure_all_projects();
  }

  public set_email_invite(body: string): void {
    this.set({ email_invite: body, table: "settings" });
  }

  // Set the pay option for the course, and ensure that the course fields are
  // set on every student project in the course (see schema.coffee for format
  // of the course field) to reflect this change in the database.
  public async set_course_info(pay: string = ""): Promise<void> {
    this.set({
      pay,
      table: "settings"
    });
    await this.student_projects.set_all_student_project_course_info(pay);
  }

  // SHARED PROJECT ACTIONS
  // These hang off of this.shared_project
  
  // STUDENTS ACTIONS
  public async add_students(
    students: { account_id?: string; email_address?: string }[]
  ): Promise<void> {
    await this.students.add_students(students);
  }

  public async delete_student(student_id: string): Promise<void> {
    await this.students.delete_student(student_id);
  }

  public async undelete_student(student_id: string): void {
    await this.students.undelete_student(student_id);
  }

  public async delete_all_students(): Promise<void> {
    await this.students.delete_all_students();
  }

  // Some students might *only* have been added using their email address, but they
  // subsequently signed up for an CoCalc account.  We check for any of these and if
  // we find any, we add in the account_id information about that student.
  public async lookup_nonregistered_students(): Promise<void> {
    await this.students.lookup_nonregistered_students();
  }

  // columns: first_name, last_name, email, last_active, hosting
  // Toggles ascending/decending order
  public set_active_student_sort(column_name: string): void {
    this.students.set_active_student_sort(column_name);
  }

  public async set_internal_student_info(
    student_id: string,
    info: { first_name: string; last_name: string; email_address?: string }
  ): Promise<void> {
    await this.students.set_internal_student_info(student_id, info);
  }

  public set_student_note(student_id: string, note: string): void {
    this.students.set_student_note(student_id, note);
  }

  // STUDENT PROJECTS ACTIONS

  // Create a single student project.
  public async create_student_project(
    student_id: string
  ): Promise<string | undefined> {
    return await this.student_projects.create_student_project(student_id);
  }

  // start or stop projects of all (non-deleted) students running
  public action_all_student_projects(action: "start" | "stop"): void {
    this.student_projects.action_all_student_projects(action);
  }

  public cancel_action_all_student_projects(): void {
    this.setState({ action_all_projects_state: "any" });
  }

  public async run_in_all_student_projects(
    command: string,
    args?: string[],
    timeout?: number,
    log?: Function
  ): Promise<Result[]> {
    return await this.student_projects.run_in_all_student_projects(
      command,
      args,
      timeout,
      log
    );
  }

  public async configure_all_projects(force: boolean = false): Promise<void> {
    await this.student_projects.configure_all_projects(force);
  }

  // Deletes student projects and removes students from those projects
  public async delete_all_student_projects(): Promise<void> {
    await this.student_projects.delete_all_student_projects();
  }

  // upgrade_goal is a map from the quota type to the goal quota the instructor wishes
  // to get all the students to.
  public async upgrade_all_student_projects(
    upgrade_goal: UpgradeGoal
  ): Promise<void> {
    await this.student_projects.upgrade_all_student_projects(upgrade_goal);
  }

  // Do an admin upgrade to all student projects.  This changes the base quotas for every student
  // project as indicated by the quotas object.  E.g., to increase the core quota from 1 to 2, do
  //         .admin_upgrade_all_student_projects(cores:2)
  // The quotas are: cores, cpu_shares, disk_quota, memory, mintime, network, member_host
  public async admin_upgrade_all_student_projects(quotas): Promise<void> {
    await this.student_projects.admin_upgrade_all_student_projects(quotas);
  }

  // ASSIGNMENT ACTIONS
  // These all hang off of this.assignments now.

  // HANDOUT ACTIONS
  // These all hang off of this.handouts now.


  // UTILITY FUNCTIONS

  /* Utility function that makes getting student/assignment/handout
     object associated to an id cleaner, since we do this a LOT in
     our code, and there was a lot of code duplication as a result.
     If something goes wrong and the finish function is defined, then
     it is called with a string describing the error.
    */
  public resolve(opts: {
    assignment_id?: string;
    student_id?: string;
    handout_id?: string;
    finish?: Function;
  }): {
    student?: StudentRecord;
    assignment?: AssignmentRecord;
    handout?: HandoutRecord;
    store: CourseStore;
  } {
    const r: any = {};
    const store = (r.store = this.get_store());

    if (opts.student_id) {
      const student = store.get_student(opts.student_id);
      if (student == null) {
        if (opts.finish != null) {
          opts.finish("no student " + opts.student_id);
        }
        return r;
      }
      r.student = student;
    }
    if (opts.assignment_id) {
      const assignment = store.get_assignment(opts.assignment_id);
      if (assignment == null) {
        if (opts.finish != null) {
          opts.finish("no assignment " + opts.assignment_id);
        }
        return r;
      }
      r.assignment = assignment;
    }
    if (opts.handout_id) {
      const handout = store.get_handout(opts.handout_id);
      if (handout == null) {
        if (opts.finish != null) {
          opts.finish("no handout " + opts.handout_id);
        }
        return r;
      }
      r.handout = handout;
    }
    return r;
  }

  // Takes an item_name and the id of the time
  // item_name should be one of
  // ['student', 'assignment', 'peer_config', handout', 'skip_grading']
  public toggle_item_expansion(
    item_name:
      | "student"
      | "assignment"
      | "peer_config"
      | "handout"
      | "skip_grading",
    item_id
  ): void {
    let adjusted;
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const field_name: any = `expanded_${item_name}s`;
    const expanded_items = store.get(field_name);
    if (expanded_items.has(item_id)) {
      adjusted = expanded_items.delete(item_id);
    } else {
      adjusted = expanded_items.add(item_id);
    }
    this.setState({ [field_name]: adjusted });
  }
}
