/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Number of days to wait until re-inviting students via email.
// The user can always just click the "Reconfigure all projects" button in
// the Configuration page, and that always resends email invites.
export const EMAIL_REINVITE_DAYS = 6;

// CoCalc libraries
import { SyncDB } from "smc-util/sync/editor/db/sync";
import { SyncDBRecord } from "./types";

// Course Library
import {
  CourseState,
  CourseStore,
  AssignmentRecord,
  StudentRecord,
  HandoutRecord,
} from "./store";

import { SharedProjectActions } from "./shared-project/actions";
import { ActivityActions } from "./activity/actions";
import { StudentsActions } from "./students/actions";
import { StudentProjectsActions } from "./student-projects/actions";
import { AssignmentsActions } from "./assignments/actions";
import { HandoutsActions } from "./handouts/actions";
import { ConfigurationActions } from "./configuration/actions";
import { ExportActions } from "./export/actions";
import { ProjectsStore } from "../projects/store";
import { bind_methods } from "smc-util/misc2";

// React libraries
import { Actions, TypedMap } from "../app-framework";

export const PARALLEL_LIMIT = 3; // number of async things to do in parallel

const primary_key = {
  students: "student_id",
  assignments: "assignment_id",
  handouts: "handout_id",
};

// Requires a syncdb to be set later
// Manages local and sync changes
export class CourseActions extends Actions<CourseState> {
  public syncdb: SyncDB;
  private last_collaborator_state: any;
  private activity: ActivityActions;
  public students: StudentsActions;
  public student_projects: StudentProjectsActions;
  public shared_project: SharedProjectActions;
  public assignments: AssignmentsActions;
  public handouts: HandoutsActions;
  public configuration: ConfigurationActions;
  public export: ExportActions;
  private state: "init" | "ready" | "closed" = "init";

  constructor(name, redux) {
    super(name, redux);
    if (this.name == null || this.redux == null) {
      throw Error("BUG: name and redux must be defined");
    }

    this.shared_project = bind_methods(new SharedProjectActions(this));
    this.activity = bind_methods(new ActivityActions(this));
    this.students = bind_methods(new StudentsActions(this));
    this.student_projects = bind_methods(new StudentProjectsActions(this));
    this.assignments = bind_methods(new AssignmentsActions(this));
    this.handouts = bind_methods(new HandoutsActions(this));
    this.configuration = bind_methods(new ConfigurationActions(this));
    this.export = bind_methods(new ExportActions(this));
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
    changes.map((obj) => {
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
  public handle_projects_store_update(projects_store: ProjectsStore): void {
    const store = this.redux.getStore<CourseState, CourseStore>(this.name);
    if (store == null) return; // not needed yet.
    let users = projects_store.getIn([
      "project_map",
      store.get("course_project_id"),
      "users",
    ]);
    if (users == null) return;
    users = users.keySeq();
    if (this.last_collaborator_state == null) {
      this.last_collaborator_state = users;
      return;
    }
    if (!this.last_collaborator_state.equals(users)) {
      this.student_projects.configure_all_projects();
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
        error = `${store.get("error")} \n${error}`;
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
  // These hang off of this.configuration

  // SHARED PROJECT ACTIONS
  // These hang off of this.shared_project

  // STUDENTS ACTIONS
  // These hang off of this.students

  // STUDENT PROJECTS ACTIONS
  // These all hang off of this.student_projects now.

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
          return r;
        }
      } else {
        r.student = student;
      }
    }
    if (opts.assignment_id) {
      const assignment = store.get_assignment(opts.assignment_id);
      if (assignment == null) {
        if (opts.finish != null) {
          opts.finish("no assignment " + opts.assignment_id);
          return r;
        }
      } else {
        r.assignment = assignment;
      }
    }
    if (opts.handout_id) {
      const handout = store.get_handout(opts.handout_id);
      if (handout == null) {
        if (opts.finish != null) {
          opts.finish("no handout " + opts.handout_id);
          return r;
        }
      } else {
        r.handout = handout;
      }
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
      if (item_name == "assignment") {
        // for assignments, whenever show more details also update the directory listing,
        // since various things that get rendered in the expanded view depend on an updated listing.
        this.assignments.update_listing(item_id);
      }
    }
    this.setState({ [field_name]: adjusted });
  }
}
