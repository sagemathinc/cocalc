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

// 3rd party libs
import * as async from "async";
const markdownlib = require("../markdown");

// CoCalc libraries
const misc = require("smc-util/misc");
const { defaults, required } = misc;
const { webapp_client } = require("../webapp_client");

// Course Library
import { previous_step, Step, assignment_identifier } from "./util";
import {
  CourseState,
  CourseStore,
  AssignmentRecord,
  StudentRecord,
  Feedback
} from "./store";

import { run_in_all_projects, Result } from "./run-in-all-projects";

// React libraries
import { Actions } from "../app-framework";

const PARALLEL_LIMIT = 5; // number of async things to do in parallel

const primary_key = {
  students: "student_id",
  assignments: "assignment_id",
  handouts: "handout_id"
};

// Requires a syncdb to be set later
// Manages local and sync changes
export class CourseActions extends Actions<CourseState> {
  public syncdb: any;
  private _last_collaborator_state: any;
  private _activity_id: number;
  private _create_student_project_queue: any[];
  private _creating_student_project: boolean;
  private prev_interval_id: number;
  private prev_timeout_id: number;

  constructor(name, redux) {
    super(name, redux);
    this._loaded = this._loaded.bind(this);
    this._store_is_initialized = this._store_is_initialized.bind(this);
    this._set = this._set.bind(this);
    this._get_one = this._get_one.bind(this);
    this.set_tab = this.set_tab.bind(this);
    this.save = this.save.bind(this);
    this._syncdb_change = this._syncdb_change.bind(this);
    this.handle_projects_store_update = this.handle_projects_store_update.bind(
      this
    );
    this._init_who_pay = this._init_who_pay.bind(this);
    this.set_error = this.set_error.bind(this);
    this.set_activity = this.set_activity.bind(this);
    this.clear_activity = this.clear_activity.bind(this);
    this.set_title = this.set_title.bind(this);
    this.set_description = this.set_description.bind(this);
    this.set_pay_choice = this.set_pay_choice.bind(this);
    this.set_upgrade_goal = this.set_upgrade_goal.bind(this);
    this.set_allow_collabs = this.set_allow_collabs.bind(this);
    this.set_email_invite = this.set_email_invite.bind(this);
    this.shared_project_settings = this.shared_project_settings.bind(this);
    this.set_shared_project_title = this.set_shared_project_title.bind(this);
    this.set_shared_project_description = this.set_shared_project_description.bind(
      this
    );
    this.action_shared_project = this.action_shared_project.bind(this);
    this.configure_shared_project = this.configure_shared_project.bind(this);
    this._set_shared_project_id = this._set_shared_project_id.bind(this);
    this.create_shared_project = this.create_shared_project.bind(this);
    this.set_course_info = this.set_course_info.bind(this);
    this.toggle_item_expansion = this.toggle_item_expansion.bind(this);
    this.add_students = this.add_students.bind(this);
    this.delete_student = this.delete_student.bind(this);
    this.undelete_student = this.undelete_student.bind(this);
    this.lookup_nonregistered_students = this.lookup_nonregistered_students.bind(
      this
    );
    this.set_active_student_sort = this.set_active_student_sort.bind(this);
    this.set_internal_student_info = this.set_internal_student_info.bind(this);
    this.create_student_project = this.create_student_project.bind(this);
    this._process_create_student_project_queue = this._process_create_student_project_queue.bind(
      this
    );
    this.configure_project_users = this.configure_project_users.bind(this);
    this.configure_project_visibility = this.configure_project_visibility.bind(
      this
    );
    this.configure_project_title = this.configure_project_title.bind(this);
    this.action_all_student_projects = this.action_all_student_projects.bind(
      this
    );
    this.set_all_student_project_titles = this.set_all_student_project_titles.bind(
      this
    );
    this.configure_project_description = this.configure_project_description.bind(
      this
    );
    this.set_all_student_project_descriptions = this.set_all_student_project_descriptions.bind(
      this
    );
    this.set_all_student_project_course_info = this.set_all_student_project_course_info.bind(
      this
    );
    this.configure_project = this.configure_project.bind(this);
    this.delete_project = this.delete_project.bind(this);
    this.configure_all_projects = this.configure_all_projects.bind(this);
    this.delete_all_student_projects = this.delete_all_student_projects.bind(
      this
    );
    this.delete_shared_project = this.delete_shared_project.bind(this);
    this.upgrade_all_student_projects = this.upgrade_all_student_projects.bind(
      this
    );
    this.admin_upgrade_all_student_projects = this.admin_upgrade_all_student_projects.bind(
      this
    );
    this.set_student_note = this.set_student_note.bind(this);
    this._collect_path = this._collect_path.bind(this);
    this.add_assignment = this.add_assignment.bind(this);
    this.delete_assignment = this.delete_assignment.bind(this);
    this.undelete_assignment = this.undelete_assignment.bind(this);
    this.save_feedback = this.save_feedback.bind(this);
    this.set_active_assignment_sort = this.set_active_assignment_sort.bind(
      this
    );
    this._set_assignment_field = this._set_assignment_field.bind(this);
    this.set_due_date = this.set_due_date.bind(this);
    this.set_assignment_note = this.set_assignment_note.bind(this);
    this.set_peer_grade = this.set_peer_grade.bind(this);
    this.set_skip = this.set_skip.bind(this);
    this.update_peer_assignment = this.update_peer_assignment.bind(this);
    this.copy_assignment_from_student = this.copy_assignment_from_student.bind(
      this
    );
    this.return_assignment_to_student = this.return_assignment_to_student.bind(
      this
    );
    this.return_assignment_to_all_students = this.return_assignment_to_all_students.bind(
      this
    );
    this._finish_copy = this._finish_copy.bind(this);
    this._start_copy = this._start_copy.bind(this);
    this._stop_copy = this._stop_copy.bind(this);
    this.copy_assignment_to_student = this.copy_assignment_to_student.bind(
      this
    );
    this.copy_assignment_create_due_date_file = this.copy_assignment_create_due_date_file.bind(
      this
    );
    this.copy_assignment = this.copy_assignment.bind(this);
    this.copy_assignment_to_all_students = this.copy_assignment_to_all_students.bind(
      this
    );
    this.copy_assignment_from_all_students = this.copy_assignment_from_all_students.bind(
      this
    );
    this.peer_copy_to_all_students = this.peer_copy_to_all_students.bind(this);
    this.peer_collect_from_all_students = this.peer_collect_from_all_students.bind(
      this
    );
    this._action_all_students = this._action_all_students.bind(this);
    this.peer_copy_to_student = this.peer_copy_to_student.bind(this);
    this.peer_collect_from_student = this.peer_collect_from_student.bind(this);
    this.stop_copying_assignment = this.stop_copying_assignment.bind(this);
    this.open_assignment = this.open_assignment.bind(this);
    this.add_handout = this.add_handout.bind(this);
    this.delete_handout = this.delete_handout.bind(this);
    this.undelete_handout = this.undelete_handout.bind(this);
    this._set_handout_field = this._set_handout_field.bind(this);
    this.set_handout_note = this.set_handout_note.bind(this);
    this._handout_finish_copy = this._handout_finish_copy.bind(this);
    this._handout_start_copy = this._handout_start_copy.bind(this);
    this.stop_copying_handout = this.stop_copying_handout.bind(this);
    this.copy_handout_to_student = this.copy_handout_to_student.bind(this);
    this.copy_handout_to_all_students = this.copy_handout_to_all_students.bind(
      this
    );
    this.open_handout = this.open_handout.bind(this);
    if (this.name == null) {
      throw Error("@name must be defined");
    }
    if (this.redux == null) {
      throw Error("@redux must be defined");
    }
  }

  get_store = (): CourseStore | undefined => {
    return this.redux.getStore<CourseState, CourseStore>(this.name);
  };

  _loaded() {
    if (this.syncdb == null) {
      this.set_error("attempt to set syncdb before loading");
      return false;
    }
    return true;
  }

  _store_is_initialized() {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (
      !(
        store.get("students") != null &&
        store.get("assignments") != null &&
        store.get("settings") != null &&
        store.get("handouts")
      )
    ) {
      this.set_error("store must be initialized");
      return false;
    }
    return true;
  }

  // Set one object in the syncdb
  _set(obj) {
    if (
      !this._loaded() ||
      (this.syncdb != null ? this.syncdb.get_state() === "closed" : undefined)
    ) {
      return;
    }
    this.syncdb.set(obj);
    this.syncdb.save();
  }

  // Get one object from @syncdb as a Javascript object (or undefined)
  _get_one(obj) {
    if (
      this.syncdb != null ? this.syncdb.get_state() === "closed" : undefined
    ) {
      return;
    }
    return __guard__(this.syncdb.get_one(obj), x => x.toJS());
  }

  set_tab(tab) {
    this.setState({ tab });
  }

  async save(): Promise<void> {
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

  _syncdb_change(changes) {
    // console.log('_syncdb_change', JSON.stringify(changes.toJS()))
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

  handle_projects_store_update(state) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const users = __guard__(
      state.getIn(["project_map", store.get("course_project_id"), "users"]),
      x => x.keySeq()
    );
    if (users == null) {
      return;
    }
    if (this._last_collaborator_state == null) {
      this._last_collaborator_state = users;
      return;
    }
    if (!this._last_collaborator_state.equals(users)) {
      this.configure_all_projects();
    }
    return (this._last_collaborator_state = users);
  }

  _init_who_pay() {
    // pre-set either student_pay or institute_pay based on what the user has already done...?
    // This is only here for transition, and can be deleted in say May 2018.
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const settings = store.get("settings");
    if (settings.get("institute_pay") || settings.get("student_pay")) {
      // already done
      return;
    }
    this.set_pay_choice("institute", false);
    this.set_pay_choice("student", false);
    if (settings.get("pay")) {
      // evidence of student pay choice
      this.set_pay_choice("student", true);
      return;
    }
    // is any student project upgraded
    const projects_store = this.redux.getStore("projects");
    let institute_pay = true;
    let num = 0;
    store.get("students").forEach(student => {
      if (student.get("deleted")) {
        return;
      }
      const p = student.get("project_id");
      if (
        p == null ||
        !__guard__(
          projects_store.get_total_project_quotas(p),
          x => x.member_host
        )
      ) {
        institute_pay = false;
        return false;
      }
      num += 1;
    });
    if (institute_pay && num > 0) {
      return this.set_pay_choice("institute", true);
    }
  }

  // PUBLIC API
  set_error(error) {
    if (error === "") {
      return this.setState({ error });
    } else {
      let left;
      return this.setState({
        error: (
          ((left = __guard__(this.get_store(), x => x.get("error"))) != null
            ? left
            : "") +
          "\n" +
          error
        ).trim()
      });
    }
  }

  set_activity(opts) {
    opts = defaults(opts, {
      id: undefined,
      desc: undefined
    });
    if (opts.id == null && opts.desc == null) {
      return;
    }
    if (opts.id == null) {
      this._activity_id =
        (this._activity_id != null ? this._activity_id : 0) + 1;
      opts.id = this._activity_id;
    }
    const store = this.get_store();
    if (store == null) {
      // course was closed
      return;
    }
    let x = __guard__(store.get_activity(), x1 => x1.toJS());
    if (x == null) {
      x = {};
    }
    if (opts.desc == null) {
      delete x[opts.id];
    } else {
      x[opts.id] = opts.desc;
      // enable for debugging:
      // console.log(opts.desc);
    }
    this.setState({ activity: x });
    return opts.id;
  }

  clear_activity(id?) {
    if (id != null) {
      return this.set_activity({ id }); // clears for this id
    } else {
      return this.setState({ activity: {} });
    }
  }

  // Configuration
  set_title(title) {
    this._set({ title, table: "settings" });
    this.set_all_student_project_titles(title);
    return this.set_shared_project_title();
  }

  set_description(description) {
    this._set({ description, table: "settings" });
    this.set_all_student_project_descriptions(description);
    return this.set_shared_project_description();
  }

  set_pay_choice(type, value) {
    return this._set({ [`${type}_pay`]: value, table: "settings" });
  }

  set_upgrade_goal(upgrade_goal) {
    return this._set({ upgrade_goal, table: "settings" });
  }

  set_allow_collabs(allow_collabs) {
    this._set({ allow_collabs, table: "settings" });
    return this.configure_all_projects();
  }

  set_email_invite(body) {
    return this._set({ email_invite: body, table: "settings" });
  }

  // return the default title and description of the shared project.
  shared_project_settings(title?) {
    const store = this.get_store();
    if (store == null) {
      return { title: undefined, description: undefined };
    }
    const x = {
      title: `Shared Project -- ${
        title != null ? title : store.get("settings").get("title")
      }`,
      description:
        store.get("settings").get("description") +
        "\n\n---\n\nThis project is shared with all students in the course."
    };
    return x;
  }

  set_shared_project_title() {
    const store = this.get_store();
    const shared_id = store != null ? store.get_shared_project_id() : undefined;
    if (store == null || !shared_id) {
      return;
    }

    const { title } = this.shared_project_settings();
    return this.redux
      .getActions("projects")
      .set_project_title(shared_id, title);
  }

  set_shared_project_description() {
    const store = this.get_store();
    const shared_id = store != null ? store.get_shared_project_id() : undefined;
    if (store == null || !shared_id) {
      return;
    }

    const { description } = this.shared_project_settings();
    return this.redux
      .getActions("projects")
      .set_project_description(shared_id, description);
  }

  // start the shared project running (if it is defined)
  action_shared_project(action) {
    if (!["start", "stop", "restart"].includes(action)) {
      throw Error("action must be start, stop or restart");
    }
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const shared_project_id = store.get_shared_project_id();
    if (!shared_project_id) {
      return; // no shared project
    }
    return __guardMethod__(
      this.redux.getActions("projects"),
      action + "_project",
      (o, m) => o[m](shared_project_id)
    );
  }

  // configure the shared project so that it has everybody as collaborators
  configure_shared_project() {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const shared_project_id = store.get_shared_project_id();
    if (!shared_project_id) {
      return; // no shared project
    }
    this.set_shared_project_title();
    // add collabs -- all collaborators on course project and all students
    const projects = this.redux.getStore("projects");
    const shared_project_users = projects.get_users(shared_project_id);
    if (shared_project_users == null) {
      return;
    }
    const course_project_users = projects.get_users(
      store.get("course_project_id")
    );
    if (course_project_users == null) {
      return;
    }
    const student_account_ids = {};
    store.get_students().map((student, _) => {
      if (!student.get("deleted")) {
        const account_id = student.get("account_id");
        if (account_id != null) {
          return (student_account_ids[account_id] = true);
        }
      }
    });

    // Each of shared_project_users or course_project_users are
    // immutable.js maps from account_id's to something, and students is a map from
    // the student account_id's.
    // Our goal is to ensur that:
    //   {shared_project_users} = {course_project_users} union {students}.

    const actions = this.redux.getActions("projects");
    if (!store.get_allow_collabs()) {
      // Ensure the shared project users are all either course or students
      shared_project_users.map((_, account_id) => {
        if (
          !course_project_users.get(account_id) &&
          !student_account_ids[account_id]
        ) {
          actions.remove_collaborator(shared_project_id, account_id);
        }
      });
    }
    // Ensure every course project user is on the shared project
    course_project_users.map((_, account_id) => {
      if (!shared_project_users.get(account_id)) {
        return actions.invite_collaborator(shared_project_id, account_id);
      }
    });
    // Ensure every student is on the shared project
    for (let account_id in student_account_ids) {
      if (!shared_project_users.get(account_id)) {
        actions.invite_collaborator(shared_project_id, account_id);
      }
    }
  }

  // set the shared project id in our syncdb
  _set_shared_project_id(project_id) {
    return this._set({
      table: "settings",
      shared_project_id: project_id
    });
  }

  // create the globally shared project if it doesn't exist
  create_shared_project() {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (store.get_shared_project_id()) {
      return;
    }
    const id = this.set_activity({
      desc: "Creating global shared project for everybody."
    });
    let x: any = this.shared_project_settings();
    x.token = misc.uuid();
    this.redux.getActions("projects").create_project(x);
    return this.redux
      .getStore("projects")
      .wait_until_project_created(x.token, 30, (err, project_id) => {
        this.clear_activity(id);
        if (err) {
          return this.set_error(`error creating shared project -- ${err}`);
        } else {
          this._set_shared_project_id(project_id);
          return this.configure_shared_project();
        }
      });
  }

  // Set the pay option for the course, and ensure that the course fields are
  // set on every student project in the course (see schema.coffee for format
  // of the course field) to reflect this change in the database.
  set_course_info(pay = "") {
    this._set({
      pay,
      table: "settings"
    });
    return this.set_all_student_project_course_info(pay);
  }

  // Takes an item_name and the id of the time
  // item_name should be one of
  // ['student', 'assignment', 'peer_config', handout', 'skip_grading']
  toggle_item_expansion(
    item_name:
      | "student"
      | "assignment"
      | "peer_config"
      | "handout"
      | "skip_grading",
    item_id
  ) {
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
    return this.setState({ [field_name]: adjusted });
  }

  // Students
  add_students(students) {
    // students = array of account_id or email_address
    // New student_id's will be constructed randomly for each student
    const student_ids: string[] = [];
    for (let x of students) {
      const student_id = misc.uuid();
      student_ids.push(student_id);
      x.table = "students";
      x.student_id = student_id;
      this.syncdb.set(x);
    }
    this.syncdb.save();
    const f = (student_id, cb) => {
      return async.series(
        [
          cb => {
            const store = this.get_store();
            if (store == null) {
              cb("store not defined");
              return;
            }
            return store.wait({
              until: (store: CourseStore) => store.get_student(student_id),
              timeout: 60,
              cb
            });
          },
          cb => {
            this.create_student_project(student_id);
            const store = this.get_store();
            if (store == null) {
              cb("store not defined");
              return;
            }
            return store.wait({
              until: (store: CourseStore) =>
                store.get_student(student_id).get("project_id"),
              timeout: 60,
              cb
            });
          }
        ],
        cb
      );
    };
    const id = this.set_activity({
      desc: `Creating ${
        students.length
      } student projects (do not close the course until done)`
    });
    return async.mapLimit(student_ids, PARALLEL_LIMIT, f, err => {
      this.set_activity({ id });
      if (err) {
        this.set_error(`error creating student projects -- ${err}`);
      }
      // after adding students, always run configure all projects,
      // to ensure everything is set properly
      return this.configure_all_projects();
    });
  }

  delete_student(student) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    student = store.get_student(student);
    this.redux
      .getActions("projects")
      .clear_project_upgrades(student.get("project_id"));
    this._set({
      deleted: true,
      student_id: student.get("student_id"),
      table: "students"
    });
    return this.configure_all_projects(); // since they may get removed from shared project, etc.
  }

  undelete_student(student) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    student = store.get_student(student);
    this._set({
      deleted: false,
      student_id: student.get("student_id"),
      table: "students"
    });
    return this.configure_all_projects(); // since they may get added back to shared project, etc.
  }

  // Some students might *only* have been added using their email address, but they
  // subsequently signed up for an CoCalc account.  We check for any of these and if
  // we find any, we add in the account_id information about that student.
  lookup_nonregistered_students() {
    const store = this.get_store();
    if (store == null) {
      console.warn("lookup_nonregistered_students: store not initialized");
      return;
    }
    const v = {};
    const s: string[] = [];
    store.get_students().map((student, student_id) => {
      if (!student.get("account_id") && !student.get("deleted")) {
        const email = student.get("email_address");
        v[email] = student_id;
        return s.push(email);
      }
    });
    if (s.length > 0) {
      return webapp_client.user_search({
        query: s.join(","),
        limit: s.length,
        cb: (err, result) => {
          if (err) {
            return console.warn(
              `lookup_nonregistered_students: search error -- ${err}`
            );
          } else {
            return result.map(x =>
              this._set({
                account_id: x.account_id,
                table: "students",
                student_id: v[x.email_address]
              })
            );
          }
        }
      });
    }
  }

  // columns: first_name ,last_name, email, last_active, hosting
  // Toggles ascending/decending order
  set_active_student_sort(column_name) {
    let is_descending;
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const current_column = store.getIn(["active_student_sort", "column_name"]);
    if (current_column === column_name) {
      is_descending = !store.getIn(["active_student_sort", "is_descending"]);
    } else {
      is_descending = false;
    }
    return this.setState({
      active_student_sort: { column_name, is_descending }
    });
  }

  set_internal_student_info(student, info) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    student = store.get_student(student);

    info = defaults(info, {
      first_name: required,
      last_name: required,
      email_address: student.get("email_address")
    });

    this._set({
      first_name: info.first_name,
      last_name: info.last_name,
      email_address: info.email_address,
      student_id: student.get("student_id"),
      table: "students"
    });
    return this.configure_all_projects(); // since they may get removed from shared project, etc.
  }

  // Student projects

  // Create a single student project.
  create_student_project(student) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (store.get("students") == null || store.get("settings") == null) {
      this.set_error("attempt to create when stores not yet initialized");
      return;
    }
    if (this._create_student_project_queue == null) {
      this._create_student_project_queue = [student];
    } else {
      this._create_student_project_queue.push(student);
    }
    if (!this._creating_student_project) {
      return this._process_create_student_project_queue();
    }
  }

  // Process first requested student project creation action, then each subsequent one until
  // there aren't any more to do.
  _process_create_student_project_queue() {
    this._creating_student_project = true;
    const queue = this._create_student_project_queue;
    const student = queue[0];
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const student_id = store.get_student(student).get("student_id");
    this._set({
      create_project: webapp_client.server_time(),
      table: "students",
      student_id
    });
    const id = this.set_activity({
      desc: `Create project for ${store.get_student_name(student_id)}.`
    });
    const token = misc.uuid();
    this.redux.getActions("projects").create_project({
      title: store.get("settings").get("title"),
      description: store.get("settings").get("description"),
      token
    });
    return this.redux
      .getStore("projects")
      .wait_until_project_created(token, 30, (err, project_id) => {
        this.clear_activity(id);
        if (err) {
          this.set_error(
            `error creating student project for ${store.get_student_name(
              student_id
            )} -- ${err}`
          );
        } else {
          this._set({
            create_project: null,
            project_id,
            table: "students",
            student_id
          });
          this.configure_project(student_id, undefined, project_id);
        }
        delete this._creating_student_project;
        queue.shift();
        if (queue.length > 0) {
          // do next one
          return this._process_create_student_project_queue();
        }
      });
  }

  configure_project_users(
    student_project_id,
    student_id,
    do_not_invite_student_by_email
  ) {
    //console.log("configure_project_users", student_project_id, student_id)
    // Add student and all collaborators on this project to the project with given project_id.
    // users = who is currently a user of the student's project?
    let left;
    const users = this.redux.getStore("projects").get_users(student_project_id); // immutable.js map
    if (users == null) {
      // can't do anything if this isn't known...
      return;
    }
    // Define function to invite or add collaborator
    const s = this.get_store();
    if (s == null) {
      return;
    }
    const { SITE_NAME } = require("smc-util/theme");
    const SiteName =
      (left = this.redux.getStore("customize").site_name) != null
        ? left
        : SITE_NAME;
    let body = s.get_email_invite();
    const invite = x => {
      // console.log("invite", x, " to ", student_project_id);
      const account_store = this.redux.getStore("account");
      const name = account_store.get_fullname();
      const replyto = account_store.get_email_address();
      if (x.includes("@")) {
        if (!do_not_invite_student_by_email) {
          const title = s.get("settings").get("title");
          const subject = `${SiteName} Invitation to Course ${title}`;
          body = body.replace(/{title}/g, title).replace(/{name}/g, name);
          body = markdownlib.markdown_to_html(body);
          this.redux
            .getActions("projects")
            .invite_collaborators_by_email(
              student_project_id,
              x,
              body,
              subject,
              true,
              replyto,
              name
            );
        }
      } else {
        this.redux
          .getActions("projects")
          .invite_collaborator(student_project_id, x);
      }
    };
    // Make sure the student is on the student's project:
    const student = s.get_student(student_id);
    const student_account_id = student.get("account_id");
    if (student_account_id == null) {
      // no known account yet
      invite(student.get("email_address"));
    } else if (
      (users != null ? users.get(student_account_id) : undefined) == null
    ) {
      // users might not be set yet if project *just* created
      invite(student_account_id);
    }
    // Make sure all collaborators on course project are on the student's project:
    const course_collaborators = this.redux
      .getStore("projects")
      .get_users(s.get("course_project_id"));
    if (course_collaborators == null) {
      // console.log("projects store isn't sufficiently initialized yet...");
      return;
    }
    course_collaborators.map((_, account_id) => {
      if (users.get(account_id) == null) {
        invite(account_id);
      }
    });
    // Regarding student_account_id !== undefined below, see https://github.com/sagemathinc/cocalc/pull/3259
    // The problem is that student_account_id might not yet be known to the .course, even though
    // the student has been added and the account_id exists, and is known to the account opening
    // the .course file.  This is just due to a race condition somewhere else.  For now -- before
    // just factoring out and rewriting all this code better -- we at least make this one change
    // so the student isn't "brutally" kicked out of the course.
    if (
      s.get("settings") != undefined &&
      !s.get_allow_collabs() &&
      student_account_id != undefined
    ) {
      // Remove anybody extra on the student project
      users.map((_, account_id) => {
        if (
          course_collaborators.get(account_id) == null &&
          account_id !== student_account_id
        ) {
          this.redux
            .getActions("projects")
            .remove_collaborator(student_project_id, account_id);
        }
      });
    }
  }

  configure_project_visibility(student_project_id) {
    const users_of_student_project = this.redux
      .getStore("projects")
      .get_users(student_project_id);
    if (users_of_student_project == null) {
      // e.g., not defined in admin view mode
      return;
    }
    // Make project not visible to any collaborator on the course project.
    let store = this.get_store();
    if (store == undefined) {
      return;
    }
    const users = this.redux
      .getStore("projects")
      .get_users(store.get("course_project_id"));
    if (users == null) {
      // TODO: should really wait until users is defined, which is a supported thing to do on stores!
      return;
    }
    return users.map((_, account_id) => {
      const x = users_of_student_project.get(account_id);
      if (x != null && !x.get("hide")) {
        return this.redux
          .getActions("projects")
          .set_project_hide(account_id, student_project_id, true);
      }
    });
  }

  configure_project_title(student_project_id, student_id) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const title = `${store.get_student_name(student_id)} - ${store
      .get("settings")
      .get("title")}`;
    return this.redux
      .getActions("projects")
      .set_project_title(student_project_id, title);
  }

  // start projects of all (non-deleted) students running
  action_all_student_projects(action) {
    if (!["start", "stop"].includes(action)) {
      throw Error("action must be start or stop");
    }
    this.action_shared_project(action);

    // Returns undefined if no store.
    const act_on_student_projects = () => {
      return __guard__(this.get_store(), x =>
        x
          .get_students()
          .filter(student => {
            return !student.get("deleted") && student.get("project_id") != null;
          })
          .map(student => {
            return this.redux
              .getActions("projects")
              [action + "_project"](student.get("project_id"));
          })
      );
    };
    if (!act_on_student_projects()) {
      return;
    }

    if (this.prev_interval_id) {
      window.clearInterval(this.prev_interval_id);
      this.prev_interval_id = 0;
    }
    if (this.prev_timeout_id) {
      window.clearTimeout(this.prev_timeout_id);
      this.prev_timeout_id = 0;
    }
    if (action === "start") {
      // action is start -- in this case we bizarely keep starting the
      // projects every 30s.  This is basically a no-op when already running,
      // so maybe not so bad.  (Do NOT do this for stop or restart, since
      // those are NOT no-ops, or user might try to start project, only to
      // be stopped.)
      // Anyway this is just nuts, but whatever. It needs to be rewritten.
      const clear_state = () => {
        window.clearInterval(this.prev_interval_id);
        return this.setState({ action_all_projects_state: "any" });
      };

      this.prev_interval_id = window.setInterval(
        act_on_student_projects,
        30000
      );
      this.prev_timeout_id = window.setTimeout(clear_state, 300000); // 5 minutes
    }

    if (["start", "restart"].includes(action)) {
      this.setState({ action_all_projects_state: "starting" });
    } else if (action === "stop") {
      this.setState({ action_all_projects_state: "stopping" });
    }
  }

  async run_in_all_student_projects(
    command: string,
    args?: string[],
    timeout?: number,
    log?: Function
  ): Promise<Result[]> {
    const store = this.get_store();
    if (store == null) {
      return [];
    }
    // calling start also deals with possibility that
    // it's in stop state.
    this.action_all_student_projects("start");
    return await run_in_all_projects(
      store.get_student_project_ids(),
      command,
      args,
      timeout,
      log
    );
  }

  set_all_student_project_titles(title) {
    const actions = this.redux.getActions("projects");
    __guard__(this.get_store(), x =>
      x.get_students().map((student, student_id) => {
        const student_project_id = student.get("project_id");
        const store = this.get_store();
        if (store == undefined) {
          return;
        }
        const project_title = `${store.get_student_name(
          student_id
        )} - ${title}`;
        if (student_project_id != null) {
          actions.set_project_title(student_project_id, project_title);
        }
      })
    );
  }

  configure_project_description(student_project_id) {
    this.redux
      .getActions("projects")
      .set_project_description(
        student_project_id,
        __guard__(this.get_store(), x => x.getIn(["settings", "description"]))
      );
  }

  set_all_student_project_descriptions(description) {
    __guard__(this.get_store(), x =>
      x.get_students().map(student => {
        const student_project_id = student.get("project_id");
        if (student_project_id != null) {
          return this.redux
            .getActions("projects")
            .set_project_description(student_project_id, description);
        }
      })
    );
  }

  set_all_student_project_course_info(pay?) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (pay == null) {
      pay = store.get_pay();
    } else {
      this._set({
        pay,
        table: "settings"
      });
    }
    return store.get_students().map(student => {
      const student_project_id = student.get("project_id");
      // account_id: might not be known when student first added, or if student
      // hasn't joined smc yet so there is no id.
      const student_account_id = student.get("account_id");
      const student_email_address = student.get("email_address"); // will be known if account_id isn't known.
      if (student_project_id != null) {
        return this.redux
          .getActions("projects")
          .set_project_course_info(
            student_project_id,
            store.get("course_project_id"),
            store.get("course_filename"),
            pay,
            student_account_id,
            student_email_address
          );
      }
    });
  }

  configure_project(
    student_id,
    do_not_invite_student_by_email,
    student_project_id?
  ): void {
    // student_project_id is optional. Will be used instead of from student_id store if provided.
    // Configure project for the given student so that it has the right title,
    // description, and collaborators for belonging to the indicated student.
    // - Add student and collaborators on project containing this course to the new project.
    // - Hide project from owner/collabs of the project containing the course.
    // - Set the title to [Student name] + [course title] and description to course description.
    // console.log("configure_project", student_id);
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (student_project_id == null) {
      student_project_id = store.getIn(["students", student_id, "project_id"]);
    }
    // console.log("configure_project", student_id, student_project_id);
    if (student_project_id == null) {
      this.create_student_project(student_id);
    } else {
      // console.log("configure_project", student_project_id, "will config users");
      this.configure_project_users(
        student_project_id,
        student_id,
        do_not_invite_student_by_email
      );
      this.configure_project_visibility(student_project_id);
      this.configure_project_title(student_project_id, student_id);
      this.configure_project_description(student_project_id);
    }
  }

  delete_project(student_id) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const student_project_id = store.getIn([
      "students",
      student_id,
      "project_id"
    ]);
    if (student_project_id != undefined) {
      const student_account_id = store.getIn([
        "students",
        student_id,
        "account_id"
      ]);
      if (student_account_id != undefined) {
        this.redux
          .getActions("projects")
          .remove_collaborator(student_project_id, student_account_id);
      }
      this.redux.getActions("projects").delete_project(student_project_id);
      return this._set({
        create_project: null,
        project_id: null,
        table: "students",
        student_id
      });
    }
  }

  configure_all_projects(): void {
    const id = this.set_activity({ desc: "Configuring all projects" });
    this.setState({ configure_projects: "Configuring projects" });
    const store = this.get_store();
    if (store == null) {
      this.set_activity({ id });
      return;
    }
    const ids = store.get_student_ids({ deleted: false });
    if (ids == undefined) {
      return;
    }
    for (let student_id of ids) {
      this.configure_project(student_id, false);
    } // always re-invite students on running this.
    this.configure_shared_project();
    this.set_activity({ id });
    this.set_all_student_project_course_info();
  }

  // Deletes student projects and removes students from those projects
  delete_all_student_projects() {
    const id = this.set_activity({ desc: "Deleting all student projects..." });
    const store = this.get_store();
    if (store == null) {
      this.set_activity({ id });
      return;
    }
    const ids = store.get_student_ids({ deleted: false });
    if (ids == undefined) {
      return;
    }
    for (let student_id of ids) {
      this.delete_project(student_id);
    }
    return this.set_activity({ id });
  }

  // Delete the shared project, removing students too.
  delete_shared_project() {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const shared_id = store.get_shared_project_id();
    if (!shared_id) {
      return;
    }
    const project_actions = this.redux.getActions("projects");
    // delete project
    project_actions.delete_project(shared_id);
    // remove student collabs

    const ids = store.get_student_ids({ deleted: false });
    if (ids == undefined) {
      return;
    }
    for (let student_id of ids) {
      const student_account_id = store.unsafe_getIn([
        "students",
        student_id,
        "account_id"
      ]);
      if (student_account_id) {
        project_actions.remove_collaborator(shared_id, student_account_id);
      }
    }
    // make the course itself forget about the shared project:
    return this._set({
      table: "settings",
      shared_project_id: ""
    });
  }

  // upgrade_goal is a map from the quota type to the goal quota the instructor wishes
  // to get all the students to.
  upgrade_all_student_projects(upgrade_goal) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const plan = store.get_upgrade_plan(upgrade_goal);
    if (misc.len(plan) === 0) {
      // nothing to do
      return;
    }
    const id = this.set_activity({
      desc: `Adjusting upgrades on ${misc.len(plan)} student projects...`
    });
    for (let project_id in plan) {
      const upgrades = plan[project_id];
      if (project_id != null) {
        // avoid race if projects are being created *right* when we try to upgrade them.
        this.redux
          .getActions("projects")
          .apply_upgrades_to_project(project_id, upgrades, false);
      }
    }
    return setTimeout(() => this.set_activity({ id }), 5000);
  }

  // Do an admin upgrade to all student projects.  This changes the base quotas for every student
  // project as indicated by the quotas object.  E.g., to increase the core quota from 1 to 2, do
  //         .admin_upgrade_all_student_projects(cores:2)
  // The quotas are: cores, cpu_shares, disk_quota, memory, mintime, network, member_host
  admin_upgrade_all_student_projects(quotas) {
    if (
      !__guard__(this.redux.getStore("account").get("groups"), x =>
        x.contains("admin")
      )
    ) {
      console.warn("must be an admin to upgrade");
      return;
    }
    const store = this.get_store();
    if (store == null) {
      console.warn("unable to get store");
      return;
    }
    const f = (project_id, cb) => {
      const x = misc.copy(quotas);
      x.project_id = project_id;
      x.cb = (err, mesg) => {
        if (err || mesg.event === "error") {
          console.warn(
            `failed to set quotas for ${project_id} -- ${misc.to_json(mesg)}`
          );
        } else {
          console.log(`set quotas for ${project_id}`);
        }
        return cb(err);
      };
      return webapp_client.project_set_quotas(x);
    };
    const ids = store.get_student_ids();
    if (ids == undefined) {
      return;
    }
    return (
      async.mapSeries(ids),
      f,
      err => {
        if (err) {
          return console.warn(`FAIL -- ${err}`);
        } else {
          return console.log("SUCCESS");
        }
      }
    );
  }

  set_student_note(student, note) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    student = store.get_student(student);
    return this._set({
      note,
      table: "students",
      student_id: student.get("student_id")
    });
  }

  _collect_path(path) {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const i = store.get("course_filename").lastIndexOf(".");
    return store.get("course_filename").slice(0, i) + "-collect/" + path;
  }

  // Assignments
  // TODO: Make a batch adder?
  add_assignment(path) {
    // Add an assignment to the course, which is defined by giving a directory in the project.
    // Where we collect homework that students have done (in teacher project)
    let beginning;
    const collect_path = this._collect_path(path);
    const path_parts = misc.path_split(path);
    // folder that we return graded homework to (in student project)
    if (path_parts.head) {
      beginning = "/graded-";
    } else {
      beginning = "graded-";
    }
    const graded_path = path_parts.head + beginning + path_parts.tail;
    // folder where we copy the assignment to
    const target_path = path;

    return this._set({
      path,
      collect_path,
      graded_path,
      target_path,
      table: "assignments",
      assignment_id: misc.uuid()
    });
  }

  delete_assignment(assignment) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    assignment = store.get_assignment(assignment);
    return this._set({
      deleted: true,
      assignment_id: assignment.get("assignment_id"),
      table: "assignments"
    });
  }

  undelete_assignment(assignment) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    assignment = store.get_assignment(assignment);
    return this._set({
      deleted: false,
      assignment_id: assignment.get("assignment_id"),
      table: "assignments"
    });
  }

  clear_edited_feedback = (
    assignment: AssignmentRecord,
    student: StudentRecord
  ) => {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    const open_grades = store.get("active_feedback_edits");
    const new_open_grades = open_grades.delete(
      assignment_identifier(assignment, student)
    );
    this.setState({ active_feedback_edits: new_open_grades });
  };

  update_edited_feedback = (
    assignment: AssignmentRecord,
    student: StudentRecord,
    new_edited_grade?: string,
    new_edited_comments?: string
  ) => {
    const store = this.get_store();
    if (store == undefined) {
      return;
    }

    const key = assignment_identifier(assignment, student);
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
      grade = store.get_grade(assignment, student) || "";
    }

    let comments: string;
    if (new_edited_comments != undefined) {
      comments = new_edited_comments;
    } else if (current_edited_comments != undefined) {
      comments = current_edited_comments;
    } else {
      comments = store.get_comments(assignment, student) || "";
    }
    const old_edited_feedback = store.get("active_feedback_edits");
    const new_edited_feedback = old_edited_feedback.set(
      key,
      new Feedback({ edited_grade: grade, edited_comments: comments })
    );
    this.setState({ active_feedback_edits: new_edited_feedback });
  };

  save_feedback = (assignment: AssignmentRecord, student: StudentRecord) => {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const active_feedback_edits = store.get("active_feedback_edits");
    if (active_feedback_edits == undefined) {
      return;
    }
    const key = assignment_identifier(assignment, student);
    const edited_feedback = active_feedback_edits.get(key);
    if (edited_feedback == undefined) {
      return;
    }
    const query = {
      table: "assignments",
      assignment_id: assignment.get("assignment_id")
    };
    const assignment_data = this._get_one(query);

    let grades = assignment_data.grades || {};
    grades[student.get("student_id")] = edited_feedback.get("edited_grade");

    let comments = assignment_data.comments || {};
    comments[student.get("student_id")] = edited_feedback.get(
      "edited_comments"
    );
    const feedback_changes = Object.assign(
      { grades: grades, comments: comments },
      query
    );
    this._set(feedback_changes);
    this.clear_edited_feedback(assignment, student);
  };

  set_active_assignment_sort(column_name) {
    let is_descending;
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const current_column = store.getIn([
      "active_assignment_sort",
      "column_name"
    ]);
    if (current_column === column_name) {
      is_descending = !store.getIn(["active_assignment_sort", "is_descending"]);
    } else {
      is_descending = false;
    }
    return this.setState({
      active_assignment_sort: { column_name, is_descending }
    });
  }

  _set_assignment_field(assignment, name, val) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    assignment = store.get_assignment(assignment);
    this._set({
      [name]: val,
      table: "assignments",
      assignment_id: assignment.get("assignment_id")
    });
  }

  set_due_date(assignment, due_date) {
    if (typeof due_date !== "string") {
      due_date = due_date != null ? due_date.toISOString() : undefined; // using strings instead of ms for backward compatibility.
    }
    return this._set_assignment_field(assignment, "due_date", due_date);
  }

  set_assignment_note(assignment, note) {
    return this._set_assignment_field(assignment, "note", note);
  }

  set_peer_grade(assignment, config) {
    let left;
    const cur =
      (left = __guard__(assignment.get("peer_grade"), x => x.toJS())) != null
        ? left
        : {};
    for (let k in config) {
      const v = config[k];
      cur[k] = v;
    }
    return this._set_assignment_field(assignment, "peer_grade", cur);
  }

  set_skip(assignment, step, value) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    assignment = store.get_assignment(assignment); // just in case is an id
    return this._set_assignment_field(
      assignment.get("assignment_id"),
      `skip_${step}`,
      !!value
    );
  }

  // Synchronous function that makes the peer grading map for the given
  // assignment, if it hasn't already been made.
  update_peer_assignment(assignment) {
    let left;
    const store = this.get_store();
    if (store == null) {
      return;
    }
    assignment = store.get_assignment(assignment);
    let peers = assignment.getIn(["peer_grade", "map"]);
    if (peers != null) {
      return peers.toJS();
    }
    const N =
      (left = assignment.getIn(["peer_grade", "number"])) != null ? left : 1;
    const map = misc.peer_grading(store.get_student_ids(), N);
    this.set_peer_grade(assignment, { map });
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
  copy_assignment_from_student(assignment, student) {
    if (this._start_copy(assignment, student, "last_collect")) {
      return;
    }
    const id = this.set_activity({ desc: "Copying assignment from a student" });
    const finish = err => {
      this.clear_activity(id);
      this._finish_copy(assignment, student, "last_collect", err);
      if (err) {
        return this.set_error(`copy from student: ${err}`);
      }
    };
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (!this._store_is_initialized()) {
      return finish("store not yet initialized");
    }
    if (!(student = store.get_student(student))) {
      return finish("no student");
    }
    if (!(assignment = store.get_assignment(assignment))) {
      return finish("no assignment");
    }
    const student_name = store.get_student_name(student);
    const student_project_id = student.get("project_id");
    if (student_project_id == null) {
      // nothing to do
      return this.clear_activity(id);
    } else {
      const target_path =
        assignment.get("collect_path") + "/" + student.get("student_id");
      this.set_activity({
        id,
        desc: `Copying assignment from ${student_name}`
      });
      return async.series(
        [
          cb => {
            return webapp_client.copy_path_between_projects({
              src_project_id: student_project_id,
              src_path: assignment.get("target_path"),
              target_project_id: store.get("course_project_id"),
              target_path,
              overwrite_newer: true,
              backup: true,
              delete_missing: false,
              exclude_history: false,
              cb
            });
          },
          cb => {
            // write their name to a file
            const name = store.get_student_name(student, true);
            return webapp_client.write_text_file_to_project({
              project_id: store.get("course_project_id"),
              path: target_path + `/STUDENT - ${name.simple}.txt`,
              content: `This student is ${name.full}.`,
              cb
            });
          }
        ],
        finish
      );
    }
  }

  // Copy the graded files for the given assignment_id back to the student in a -graded folder.
  // If the store is initialized and the student and assignment both exist,
  // then calling this action will result in this getting set in the store:
  //
  //    assignment.last_return_graded[student_id] = {time:?, error:err}
  //
  // where time >= now is the current time in milliseconds.

  return_assignment_to_student(assignment, student) {
    let left;
    if (this._start_copy(assignment, student, "last_return_graded")) {
      return;
    }
    const id = this.set_activity({ desc: "Returning assignment to a student" });
    const finish = err => {
      this.clear_activity(id);
      this._finish_copy(assignment, student, "last_return_graded", err);
      if (err) {
        return this.set_error(`return to student: ${err}`);
      }
    };
    const store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return finish("store not yet initialized");
    }
    const grade = store.get_grade(assignment, student);
    const comments = store.get_comments(assignment, student);
    if (!(student = store.get_student(student))) {
      return finish("no student");
    }
    if (!(assignment = store.get_assignment(assignment))) {
      return finish("no assignment");
    }
    const student_name = store.get_student_name(student);
    const student_project_id = student.get("project_id");

    // if skip_grading is true, this means there *might* no be a "grade" given,
    // but instead some grading inside the files or an external tool is used.
    // therefore, only create the grade file if this is false.
    const skip_grading =
      (left = assignment.get("skip_grading")) != null ? left : false;

    if (student_project_id == null) {
      // nothing to do
      return this.clear_activity(id);
    } else {
      let peer_graded;
      this.set_activity({
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
      return async.series(
        [
          cb => {
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
            return webapp_client.write_text_file_to_project({
              project_id: store.get("course_project_id"),
              path: src_path + "/GRADE.md",
              content,
              cb
            });
          },
          cb => {
            return webapp_client.copy_path_between_projects({
              src_project_id: store.get("course_project_id"),
              src_path,
              target_project_id: student_project_id,
              target_path: assignment.get("graded_path"),
              overwrite_newer: true,
              backup: true,
              delete_missing: false,
              exclude_history: true,
              cb
            });
          },
          cb => {
            if (peer_graded) {
              // Delete GRADER file
              return webapp_client.exec({
                project_id: student_project_id,
                command: "rm ./*/GRADER*.txt",
                timeout: 60,
                bash: true,
                path: assignment.get("graded_path"),
                cb
              });
            } else {
              return cb(null);
            }
          }
        ],
        finish
      );
    }
  }

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  return_assignment_to_all_students(assignment, new_only?) {
    let left;
    const id = this.set_activity({
      desc: `Returning assignments to all students ${
        new_only ? "who have not already received it" : ""
      }`
    });
    const error = err => {
      this.clear_activity(id);
      return this.set_error(`return to student: ${err}`);
    };
    const store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return error("store not yet initialized");
    }
    assignment = store.get_assignment(assignment);
    if (!assignment) {
      return error("no assignment");
    }
    let errors = "";
    const peer = __guard__(assignment.get("peer_grade"), x => x.get("enabled"));
    const skip_grading =
      (left = assignment.get("skip_grading")) != null ? left : false;
    const f = (student_id, cb) => {
      if (
        !store.last_copied(
          previous_step(Step.return_graded, peer),
          assignment,
          student_id,
          true
        )
      ) {
        // we never collected the assignment from this student
        cb();
        return;
      }
      const has_grade = store.has_grade(assignment, student_id);
      if (!skip_grading && !has_grade) {
        // we collected and do grade, but didn't grade it yet
        cb();
        return;
      }
      if (new_only) {
        if (
          store.last_copied("return_graded", assignment, student_id, true) &&
          (skip_grading || has_grade)
        ) {
          // it was already returned
          cb();
          return;
        }
      }
      const n = misc.mswalltime();
      this.return_assignment_to_student(assignment, student_id);
      return store.wait({
        timeout: 60 * 15,
        until: (store: CourseStore) =>
          store.last_copied("return_graded", assignment, student_id) >= n,
        cb: err => {
          if (err) {
            errors += `\n ${err}`;
          }
          return cb();
        }
      });
    };
    async.mapLimit(
      store.get_student_ids({ deleted: false }),
      PARALLEL_LIMIT,
      f,
      () => {
        if (errors) {
          return error(errors);
        } else {
          return this.clear_activity(id);
        }
      }
    );
  }

  _finish_copy(assignment, student, type, err) {
    if (student != null && assignment != null) {
      let left;
      const store = this.get_store();
      if (store == null) {
        return;
      }
      student = store.get_student(student);
      assignment = store.get_assignment(assignment);
      const obj = {
        table: "assignments",
        assignment_id: assignment.get("assignment_id")
      };
      const x =
        (left = __guard__(this._get_one(obj), x1 => x1[type])) != null
          ? left
          : {};
      const student_id = student.get("student_id");
      x[student_id] = { time: misc.mswalltime() };
      if (err) {
        x[student_id].error = err;
      }
      obj[type] = x;
      return this._set(obj);
    }
  }

  // This is called internally before doing any copy/collection operation
  // to ensure that we aren't doing the same thing repeatedly, and that
  // everything is in place to do the operation.
  _start_copy(assignment, student, type) {
    if (student != null && assignment != null) {
      let left, left1;
      const store = this.get_store();
      if (store == null) {
        return;
      }
      student = store.get_student(student);
      assignment = store.get_assignment(assignment);
      const obj = {
        table: "assignments",
        assignment_id: assignment.get("assignment_id")
      };
      const x =
        (left = __guard__(this._get_one(obj), x1 => x1[type])) != null
          ? left
          : {};
      const y = (left1 = x[student.get("student_id")]) != null ? left1 : {};
      if (y.start != null && webapp_client.server_time() - y.start <= 15000) {
        return true; // never retry a copy until at least 15 seconds later.
      }
      y.start = misc.mswalltime();
      x[student.get("student_id")] = y;
      obj[type] = x;
      this._set(obj);
    }
    return false;
  }

  _stop_copy(assignment, student, type) {
    if (student != null && assignment != null) {
      const store = this.get_store();
      if (store == null) {
        return;
      }
      student = store.get_student(student);
      assignment = store.get_assignment(assignment);
      const obj = {
        table: "assignments",
        assignment_id: assignment.get("assignment_id")
      };
      const x = __guard__(this._get_one(obj), x1 => x1[type]);
      if (x == null) {
        return;
      }
      const y = x[student.get("student_id")];
      if (y == null) {
        return;
      }
      if (y.start != null) {
        delete y.start;
        x[student.get("student_id")] = y;
        obj[type] = x;
        return this._set(obj);
      }
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
  copy_assignment_to_student(assignment, student, opts) {
    const { overwrite, create_due_date_file } = defaults(opts, {
      overwrite: false,
      create_due_date_file: false
    });

    if (this._start_copy(assignment, student, "last_assignment")) {
      return;
    }
    const id = this.set_activity({ desc: "Copying assignment to a student" });
    const finish = err => {
      this.clear_activity(id);
      this._finish_copy(assignment, student, "last_assignment", err);
      if (err) {
        return this.set_error(`copy to student: ${err}`);
      }
    };
    let store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return finish("store not yet initialized");
    }
    if (!(student = store.get_student(student))) {
      return finish("no student");
    }
    if (!(assignment = store.get_assignment(assignment))) {
      return finish("no assignment");
    }

    const student_name = store.get_student_name(student);
    this.set_activity({ id, desc: `Copying assignment to ${student_name}` });
    let student_project_id = student.get("project_id");
    const student_id = student.get("student_id");
    const src_path = assignment.get("path");
    return async.series(
      [
        cb => {
          if (student_project_id == null) {
            this.set_activity({
              id,
              desc: `${student_name}'s project doesn't exist, so creating it.`
            });
            this.create_student_project(student);
            store = this.get_store();
            if (store == null) {
              cb("no store");
              return;
            }
            return store.wait({
              until: (store: CourseStore) =>
                store.get_student_project_id(student_id),
              cb: (err, x) => {
                student_project_id = x;
                return cb(err);
              }
            });
          } else {
            return cb();
          }
        },
        cb => {
          if (create_due_date_file) {
            return this.copy_assignment_create_due_date_file(
              assignment,
              store,
              cb
            );
          } else {
            return cb();
          }
        },
        cb => {
          this.set_activity({
            id,
            desc: `Copying files to ${student_name}'s project`
          });
          if (store == undefined) {
            console.warn(student_name, " failed to receieve files.");
            return;
          }
          return webapp_client.copy_path_between_projects({
            src_project_id: store.get("course_project_id"),
            src_path,
            target_project_id: student_project_id,
            target_path: assignment.get("target_path"),
            overwrite_newer: !!overwrite, // default is "false"
            delete_missing: !!overwrite, // default is "false"
            backup: !!!overwrite, // default is "true"
            exclude_history: true,
            cb
          });
        }
      ],
      err => {
        return finish(err);
      }
    );
  }

  // this is part of the assignment disribution, should be done only *once*, not for every student
  copy_assignment_create_due_date_file(assignment, store, cb) {
    // write the due date to a file
    const due_date = store.get_due_date(assignment);
    const src_path = assignment.get("path");
    const due_date_fn = "DUE_DATE.txt";
    if (due_date == null) {
      cb();
      return;
    }

    const locals = {
      due_id: this.set_activity({ desc: `Creating ${due_date_fn} file...` }),
      due_date,
      src_path,
      content: `This assignment is due\n\n   ${due_date.toLocaleString()}`,
      project_id: store.get("course_project_id"),
      path: src_path + "/" + due_date_fn,
      due_date_fn
    };

    return webapp_client.write_text_file_to_project({
      project_id: locals.project_id,
      path: locals.path,
      content: locals.content,
      cb: err => {
        this.clear_activity(locals.due_id);
        if (err) {
          return cb(
            `Problem writing ${due_date_fn} file ('${err}'). Try again...`
          );
        } else {
          return cb();
        }
      }
    });
  }

  copy_assignment(type, assignment_id, student_id) {
    // type = assigned, collected, graded
    switch (type) {
      case "assigned":
        // create_due_date_file = true
        return this.copy_assignment_to_student(assignment_id, student_id, {
          create_due_date_file: true
        });
      case "collected":
        return this.copy_assignment_from_student(assignment_id, student_id);
      case "graded":
        return this.return_assignment_to_student(assignment_id, student_id);
      case "peer-assigned":
        return this.peer_copy_to_student(assignment_id, student_id);
      case "peer-collected":
        return this.peer_collect_from_student(assignment_id, student_id);
      default:
        return this.set_error(`copy_assignment -- unknown type: ${type}`);
    }
  }

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  copy_assignment_to_all_students(assignment, new_only, overwrite) {
    const store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      console.warn("store not yet initialized");
      return;
    }
    const desc = `Copying assignments to all students ${
      new_only ? "who have not already received it" : ""
    }`;
    const short_desc = "copy to student";
    return async.series([
      cb => {
        return this.copy_assignment_create_due_date_file(assignment, store, cb);
      },
      () => {
        // by default, doesn't create the due file
        return this._action_all_students(
          assignment,
          new_only,
          this.copy_assignment_to_student,
          "assignment",
          desc,
          short_desc,
          overwrite
        );
      }
    ]);
  }

  // Copy the given assignment to all non-deleted students, doing several copies in parallel at once.
  copy_assignment_from_all_students(assignment, new_only) {
    const desc = `Copying assignment from all students ${
      new_only ? "from whom we have not already copied it" : ""
    }`;
    const short_desc = "copy from student";
    return this._action_all_students(
      assignment,
      new_only,
      this.copy_assignment_from_student,
      "collect",
      desc,
      short_desc
    );
  }

  peer_copy_to_all_students(assignment, new_only) {
    const desc = `Copying assignments for peer grading to all students ${
      new_only ? "who have not already received their copy" : ""
    }`;
    const short_desc = "copy to student for peer grading";
    return this._action_all_students(
      assignment,
      new_only,
      this.peer_copy_to_student,
      "peer_assignment",
      desc,
      short_desc
    );
  }

  peer_collect_from_all_students(assignment, new_only) {
    const desc = `Copying peer graded assignments from all students ${
      new_only ? "from whom we have not already copied it" : ""
    }`;
    const short_desc = "copy peer grading from students";
    return this._action_all_students(
      assignment,
      new_only,
      this.peer_collect_from_student,
      "peer_collect",
      desc,
      short_desc
    );
  }

  _action_all_students(
    assignment,
    new_only,
    action,
    step,
    desc,
    short_desc,
    overwrite?
  ) {
    const id = this.set_activity({ desc });
    const error = err => {
      this.clear_activity(id);
      err = `${short_desc}: ${err}`;
      return this.set_error(err);
    };
    const store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return error("store not yet initialized");
    }
    if (!(assignment = store.get_assignment(assignment))) {
      return error("no assignment");
    }
    let errors = "";
    const peer = __guard__(assignment.get("peer_grade"), x => x.get("enabled"));
    const prev_step = previous_step(step, peer);
    const f = (student_id, cb) => {
      if (
        prev_step != null &&
        !store.last_copied(prev_step, assignment, student_id, true)
      ) {
        cb();
        return;
      }
      if (new_only && store.last_copied(step, assignment, student_id, true)) {
        cb();
        return;
      }
      const n = misc.mswalltime();
      action(assignment, student_id, { overwrite });
      return store.wait({
        timeout: 60 * 15,
        until: () => store.last_copied(step, assignment, student_id) >= n,
        cb: err => {
          if (err) {
            errors += `\n ${err}`;
          }
          return cb();
        }
      });
    };

    return async.mapLimit(
      store.get_student_ids({ deleted: false }),
      PARALLEL_LIMIT,
      f,
      () => {
        if (errors) {
          return error(errors);
        } else {
          return this.clear_activity(id);
        }
      }
    );
  }

  // Copy the collected folders from some students to the given student for peer grading.
  // Assumes folder is non-empty
  peer_copy_to_student(assignment, student) {
    let left;
    if (this._start_copy(assignment, student, "last_peer_assignment")) {
      return;
    }
    const id = this.set_activity({ desc: "Copying peer grading to a student" });
    const finish = (err?) => {
      this.clear_activity(id);
      this._finish_copy(assignment, student, "last_peer_assignment", err);
      if (err) {
        return this.set_error(`copy peer-grading to student: ${err}`);
      }
    };
    const store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return finish("store not yet initialized");
    }
    if (!(student = store.get_student(student))) {
      return finish("no student");
    }
    if (!(assignment = store.get_assignment(assignment))) {
      return finish("no assignment");
    }

    const student_name = store.get_student_name(student);
    this.set_activity({ id, desc: `Copying peer grading to ${student_name}` });

    const peer_map = this.update_peer_assignment(assignment); // synchronous

    // list of student_id's
    if (peer_map == null) {
      // empty peer assignment for this student (maybe added late)
      return finish();
    }

    const peers = peer_map[student.get("student_id")];
    if (peers == null) {
      // empty peer assignment for this student (maybe added late)
      return finish();
    }

    const student_project_id = student.get("project_id");

    let guidelines =
      (left = assignment.getIn(["peer_grade", "guidelines"])) != null
        ? left
        : "Please grade this assignment.";
    const due_date = assignment.getIn(["peer_grade", "due_date"]);
    if (due_date != null) {
      guidelines =
        `GRADING IS DUE ${new Date(due_date).toLocaleString()} \n\n ` +
        guidelines;
    }
    const target_base_path = assignment.get("path") + "-peer-grade";
    const f = (student_id, cb) => {
      const src_path = assignment.get("collect_path") + "/" + student_id;
      const target_path = target_base_path + "/" + student_id;
      async.series(
        [
          cb => {
            // delete the student's name so that grading is anonymous; also, remove original
            // due date to avoid confusion.
            const name = store.get_student_name(student_id, true);
            webapp_client.exec({
              project_id: store.get("course_project_id"),
              command: "rm",
              args: [
                "-f",
                src_path + `/STUDENT - ${name.simple}.txt`,
                src_path + "/DUE_DATE.txt",
                src_path + `/STUDENT - ${name.simple}.txt~`,
                src_path + "/DUE_DATE.txt~"
              ],
              cb
            });
          },
          cb => {
            // copy the files to be peer graded into place for this student
            webapp_client.copy_path_between_projects({
              src_project_id: store.get("course_project_id"),
              src_path,
              target_project_id: student_project_id,
              target_path,
              overwrite_newer: false,
              delete_missing: false,
              cb
            });
          }
        ],
        cb
      );
    };

    // write instructions file to the student
    webapp_client.write_text_file_to_project({
      project_id: student_project_id,
      path: target_base_path + "/GRADING_GUIDE.md",
      content: guidelines,
      cb: err => {
        if (!err) {
          // now copy actual stuff to grade
          return async.mapLimit(peers, PARALLEL_LIMIT, f, finish);
        } else {
          return finish(err);
        }
      }
    });
  }

  // Collect all the peer graading of the given student (not the work the student did, but
  // the grading about the student!).
  peer_collect_from_student(assignment, student) {
    if (this._start_copy(assignment, student, "last_peer_collect")) {
      return;
    }
    const id = this.set_activity({
      desc: "Collecting peer grading of a student"
    });
    const finish = (err?) => {
      this.clear_activity(id);
      this._finish_copy(assignment, student, "last_peer_collect", err);
      if (err) {
        return this.set_error(`collecting peer-grading of a student: ${err}`);
      }
    };
    const store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return finish("store not yet initialized");
    }
    if (!(student = store.get_student(student))) {
      return finish("no student");
    }
    if (!(assignment = store.get_assignment(assignment))) {
      return finish("no assignment");
    }

    const student_name = store.get_student_name(student);
    this.set_activity({
      id,
      desc: `Collecting peer grading of ${student_name}`
    });

    // list of student_id of students that graded this student
    const peers = store.get_peers_that_graded_student(assignment, student);
    if (peers == null) {
      // empty peer assignment for this student (maybe added late)
      return finish();
    }

    const our_student_id = student.get("student_id");

    const f = (student_id, cb) => {
      const s = store.get_student(student_id);
      if (s.get("deleted")) {
        // ignore deleted students
        cb();
        return;
      }
      const path = assignment.get("path");
      const src_path = `${path}-peer-grade/${our_student_id}`;
      const target_path = `${assignment.get(
        "collect_path"
      )}-peer-grade/${our_student_id}/${student_id}`;
      return async.series(
        [
          cb => {
            // copy the files over from the student who did the peer grading
            return webapp_client.copy_path_between_projects({
              src_project_id: s.get("project_id"),
              src_path,
              target_project_id: store.get("course_project_id"),
              target_path,
              overwrite_newer: false,
              delete_missing: false,
              cb
            });
          },
          cb => {
            // write local file identifying the grader
            const name = store.get_student_name(student_id, true);
            return webapp_client.write_text_file_to_project({
              project_id: store.get("course_project_id"),
              path: target_path + `/GRADER - ${name.simple}.txt`,
              content: `The student who did the peer grading is named ${
                name.full
              }.`,
              cb
            });
          },
          cb => {
            // write local file identifying student being graded
            const name = store.get_student_name(student, true);
            return webapp_client.write_text_file_to_project({
              project_id: store.get("course_project_id"),
              path: target_path + `/STUDENT - ${name.simple}.txt`,
              content: `This student is ${name.full}.`,
              cb
            });
          }
        ],
        cb
      );
    };

    return async.mapLimit(peers, PARALLEL_LIMIT, f, finish);
  }

  // This doesn't really stop it yet, since that's not supported by the backend.
  // It does stop the spinner and let the user try to restart the copy.
  stop_copying_assignment(type, assignment_id, student_id) {
    switch (type) {
      case "assigned":
        type = "last_assignment";
        break;
      case "collected":
        type = "last_collect";
        break;
      case "graded":
        type = "last_return_graded";
        break;
      case "peer-assigned":
        type = "last_peer_assignment";
        break;
      case "peer-collected":
        type = "last_peer_collect";
        break;
    }
    return this._stop_copy(assignment_id, student_id, type);
  }

  open_assignment(type, assignment_id, student_id) {
    // type = assigned, collected, graded
    let path, proj;
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const assignment = store.get_assignment(assignment_id);
    const student = store.get_student(student_id);
    const student_project_id = student.get("project_id");
    if (student_project_id == null) {
      this.set_error("open_assignment: student project not yet created");
      return;
    }
    // Figure out what to open
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
        this.set_error(`open_assignment -- unknown type: ${type}`);
    }
    if (proj == null) {
      this.set_error("no such project");
      return;
    }
    // Now open it
    return this.redux.getProjectActions(proj).open_directory(path);
  }

  // Handouts
  add_handout(path) {
    const target_path = path; // folder where we copy the handout to
    return this._set({
      path,
      target_path,
      table: "handouts",
      handout_id: misc.uuid()
    });
  }

  delete_handout(handout) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    handout = store.get_handout(handout);
    return this._set({
      deleted: true,
      handout_id: handout.get("handout_id"),
      table: "handouts"
    });
  }

  undelete_handout(handout) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    handout = store.get_handout(handout);
    return this._set({
      deleted: false,
      handout_id: handout.get("handout_id"),
      table: "handouts"
    });
  }

  _set_handout_field(handout, name, val) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    handout = store.get_handout(handout);
    return this._set({
      [name]: val,
      table: "handouts",
      handout_id: handout.get("handout_id")
    });
  }

  set_handout_note(handout, note) {
    return this._set_handout_field(handout, "note", note);
  }

  _handout_finish_copy(handout, student, err) {
    if (student != null && handout != null) {
      let left;
      const store = this.get_store();
      if (store == null) {
        return;
      }
      student = store.get_student(student);
      handout = store.get_handout(handout);
      const obj = {
        table: "handouts",
        handout_id: handout.get("handout_id")
      };
      const status_map =
        (left = __guard__(this._get_one(obj), x => x.status)) != null
          ? left
          : {};
      const student_id = student.get("student_id");
      status_map[student_id] = { time: misc.mswalltime() };
      if (err) {
        status_map[student_id].error = err;
      }
      (obj as any).status = status_map;
      return this._set(obj);
    }
  }

  _handout_start_copy(handout, student) {
    if (student != null && handout != null) {
      let left, left1;
      const store = this.get_store();
      if (store == null) {
        return;
      }
      student = store.get_student(student);
      handout = store.get_handout(handout);
      const obj = { table: "handouts", handout_id: handout.get("handout_id") };
      const status_map =
        (left = __guard__(this._get_one(obj), x => x.status)) != null
          ? left
          : {};
      const student_status =
        (left1 = status_map[student.get("student_id")]) != null ? left1 : {};
      if (
        student_status.start != null &&
        webapp_client.server_time() - student_status.start <= 15000
      ) {
        return true; // never retry a copy until at least 15 seconds later.
      }
      student_status.start = misc.mswalltime();
      status_map[student.get("student_id")] = student_status;
      (obj as any).status = status_map;
      this._set(obj);
    }
    return false;
  }

  // "Copy" of `stop_copying_assignment:`
  stop_copying_handout(handout, student) {
    if (student != null && handout != null) {
      const store = this.get_store();
      if (store == null) {
        return;
      }
      student = store.get_student(student);
      handout = store.get_handout(handout);
      const obj = { table: "handouts", handout_id: handout.get("handout_id") };
      const status = __guard__(this._get_one(obj), x => x.status);
      if (status == null) {
        return;
      }
      const student_status = status[student.get("student_id")];
      if (student_status == null) {
        return;
      }
      if (student_status.start != null) {
        delete student_status.start;
        status[student.get("student_id")] = student_status;
        (obj as any).status = status;
        return this._set(obj);
      }
    }
  }

  // Copy the files for the given handout to the given student. If
  // the student project doesn't exist yet, it will be created.
  // You may also pass in an id for either the handout or student.
  // "overwrite" (boolean, optional): if true, the copy operation will overwrite/delete remote files in student projects -- #1483
  // If the store is initialized and the student and handout both exist,
  // then calling this action will result in this getting set in the store:
  //
  //    handout.status[student_id] = {time:?, error:err}
  //
  // where time >= now is the current time in milliseconds.
  copy_handout_to_student(handout, student, overwrite?) {
    if (this._handout_start_copy(handout, student)) {
      return;
    }
    const id = this.set_activity({ desc: "Copying handout to a student" });
    const finish = err => {
      this.clear_activity(id);
      this._handout_finish_copy(handout, student, err);
      if (err) {
        return this.set_error(`copy to student: ${err}`);
      }
    };
    let store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return finish("store not yet initialized");
    }
    if (!(student = store.get_student(student))) {
      return finish("no student");
    }
    if (!(handout = store.get_handout(handout))) {
      return finish("no handout");
    }

    const student_name = store.get_student_name(student);
    this.set_activity({ id, desc: `Copying handout to ${student_name}` });
    let student_project_id = student.get("project_id");
    const student_id = student.get("student_id");
    const course_project_id = store.get("course_project_id");
    const src_path = handout.get("path");
    return async.series(
      [
        cb => {
          if (student_project_id == null) {
            this.set_activity({
              id,
              desc: `${student_name}'s project doesn't exist, so creating it.`
            });
            this.create_student_project(student);
            store = this.get_store();
            if (store == null) {
              cb("no store");
              return;
            }
            return store.wait({
              until: (store: CourseStore) =>
                store.get_student_project_id(student_id),
              cb: (err, x) => {
                student_project_id = x;
                return cb(err);
              }
            });
          } else {
            return cb();
          }
        },
        cb => {
          this.set_activity({
            id,
            desc: `Copying files to ${student_name}'s project`
          });
          return webapp_client.copy_path_between_projects({
            src_project_id: course_project_id,
            src_path,
            target_project_id: student_project_id,
            target_path: handout.get("target_path"),
            overwrite_newer: !!overwrite, // default is "false"
            delete_missing: !!overwrite, // default is "false"
            backup: !!!overwrite, // default is "true"
            exclude_history: true,
            cb
          });
        }
      ],
      err => {
        return finish(err);
      }
    );
  }

  // Copy the given handout to all non-deleted students, doing several copies in parallel at once.
  copy_handout_to_all_students(handout, new_only, overwrite?) {
    const desc = `Copying handouts to all students ${
      new_only ? "who have not already received it" : ""
    }`;
    const short_desc = "copy to student";

    const id = this.set_activity({ desc });
    const error = err => {
      this.clear_activity(id);
      err = `${short_desc}: ${err}`;
      return this.set_error(err);
    };
    const store = this.get_store();
    if (store == null || !this._store_is_initialized()) {
      return error("store not yet initialized");
    }
    if (!(handout = store.get_handout(handout))) {
      return error("no handout");
    }
    let errors = "";
    const f = (student_id, cb) => {
      if (new_only && store.handout_last_copied(handout, student_id)) {
        cb();
        return;
      }
      const n = misc.mswalltime();
      this.copy_handout_to_student(handout, student_id, overwrite);
      return store.wait({
        timeout: 60 * 15,
        until: () => store.handout_last_copied(handout, student_id) >= n,
        cb: err => {
          if (err) {
            errors += `\n ${err}`;
          }
          return cb();
        }
      });
    };

    return async.mapLimit(
      store.get_student_ids({ deleted: false }),
      PARALLEL_LIMIT,
      f,
      () => {
        if (errors) {
          return error(errors);
        } else {
          return this.clear_activity(id);
        }
      }
    );
  }

  open_handout(handout_id, student_id) {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const handout = store.get_handout(handout_id);
    if (handout == undefined) {
      return;
    }
    const student = store.get_student(student_id);
    const student_project_id = student.get("project_id");
    if (student_project_id == null) {
      this.set_error("open_handout: student project not yet created");
      return;
    }
    const path = handout.get("target_path");
    const proj = student_project_id;
    if (proj == null) {
      this.set_error("no such project");
      return;
    }
    // Now open it
    return this.redux.getProjectActions(proj).open_directory(path);
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
function __guardMethod__(obj, methodName, transform) {
  if (
    typeof obj !== "undefined" &&
    obj !== null &&
    typeof obj[methodName] === "function"
  ) {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
