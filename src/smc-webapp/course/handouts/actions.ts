/*
Actions involving working with handouts.
*/

import { CourseActions, PARALLEL_LIMIT } from "../actions";
import { CourseStore } from "../store";
import { callback2 } from "smc-util/async-utils";
import { webapp_client } from "../../webapp-client";
import { redux } from "../../app-framework";
import { uuid, mswalltime } from "smc-util/misc";
import { map } from "awaiting";
import { SyncDBRecordHandout } from "../types";


export class HandoutsActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private get_store(): CourseStore {
    return this.course_actions.get_store();
  }

  public add_handout(path: string): void {
    const target_path = path; // folder where we copy the handout to
    this.course_actions.set({
      path,
      target_path,
      table: "handouts",
      handout_id: uuid()
    });
  }

  public delete_handout(handout_id: string): void {
    this.course_actions.set({
      deleted: true,
      handout_id,
      table: "handouts"
    });
  }

  public undelete_handout(handout_id: string): void {
    this.course_actions.set({
      deleted: false,
      handout_id,
      table: "handouts"
    });
  }

  private set_handout_field(handout, name, val): void {
    handout = this.get_store().get_handout(handout);
    this.course_actions.set({
      [name]: val,
      table: "handouts",
      handout_id: handout.get("handout_id")
    });
  }

  public set_handout_note(handout, note): void {
    this.set_handout_field(handout, "note", note);
  }

  private handout_finish_copy(
    handout_id: string,
    student_id: string,
    err: string
  ): void {
    const { student, handout } = this.course_actions.resolve({
      handout_id,
      student_id
    });
    if (student == null || handout == null) return;
    const obj: SyncDBRecordHandout = {
      table: "handouts",
      handout_id: handout.get("handout_id")
    };
    const h = this.course_actions.get_one(obj);
    if (h == null) return;
    const status_map: {
      [student_id: string]: { time?: number; error?: string };
    } = h.status ? h.status : {};
    status_map[student_id] = { time: mswalltime() };
    if (err) {
      status_map[student_id].error = err;
    }
    obj.status = status_map;
    this.course_actions.set(obj);
  }

  // returns false if an actual copy starts and true if not (since we
  // already tried or closed the store).
  private handout_start_copy(handout_id: string, student_id: string): boolean {
    const obj: any = {
      table: "handouts",
      handout_id
    };
    const x = this.course_actions.get_one(obj);
    if (x == null) {
      // no such handout.
      return true;
    }
    const status_map = x.status != null ? x.status : {};
    let student_status = status_map[student_id];
    if (student_status == null) student_status = {};
    if (
      student_status.start != null &&
      webapp_client.server_time() - student_status.start <= 15000
    ) {
      return true; // never retry a copy until at least 15 seconds later.
    }
    student_status.start = mswalltime();
    status_map[student_id] = student_status;
    obj.status = status_map;
    this.course_actions.set(obj);
    return false;
  }

  // "Copy" of `stop_copying_assignment:`
  public stop_copying_handout(handout_id: string, student_id: string): void {
    const obj: SyncDBRecordHandout = { table: "handouts", handout_id };
    const h = this.course_actions.get_one(obj);
    if (h == null) return;
    const status = h.status;
    if (status == null) return;
    const student_status = status[student_id];
    if (student_status == null) return;
    if (student_status.start != null) {
      delete student_status.start;
      status[student_id] = student_status;
      obj.status = status;
      this.course_actions.set(obj);
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
  public async copy_handout_to_student(
    handout_id: string,
    student_id: string,
    overwrite: boolean
  ): Promise<void> {
    if (this.handout_start_copy(handout_id, student_id)) {
      return;
    }
    const id = this.course_actions.set_activity({
      desc: "Copying handout to a student"
    });
    const finish = (err?) => {
      this.course_actions.clear_activity(id);
      this.handout_finish_copy(handout_id, student_id, err);
      if (err) {
        this.course_actions.set_error(`copy handout to student: ${err}`);
      }
    };
    const { store, student, handout } = this.course_actions.resolve({
      student_id,
      handout_id,
      finish
    });
    if (!student || !handout) return;

    const student_name = store.get_student_name(student_id);
    this.course_actions.set_activity({
      id,
      desc: `Copying handout to ${student_name}`
    });
    let student_project_id: string | undefined = student.get("project_id");
    const course_project_id = store.get("course_project_id");
    const src_path = handout.get("path");
    try {
      if (student_project_id == null) {
        this.course_actions.set_activity({
          id,
          desc: `${student_name}'s project doesn't exist, so creating it.`
        });
        student_project_id = await this.course_actions.student_projects.create_student_project(student_id);
      }

      this.course_actions.set_activity({
        id,
        desc: `Copying files to ${student_name}'s project`
      });

      await callback2(webapp_client.copy_path_between_projects, {
        src_project_id: course_project_id,
        src_path,
        target_project_id: student_project_id,
        target_path: handout.get("target_path"),
        overwrite_newer: !!overwrite, // default is "false"
        delete_missing: !!overwrite, // default is "false"
        backup: !!!overwrite, // default is "true"
        exclude_history: true
      });
      finish();
    } catch (err) {
      finish(err);
    }
  }

  // Copy the given handout to all non-deleted students, doing several copies in parallel at once.
  public async copy_handout_to_all_students(
    handout_id: string,
    new_only: boolean,
    overwrite: boolean
  ): Promise<void> {
    const desc: string =
      "Copying handouts to all students " +
      (new_only ? "who have not already received it" : "");
    const short_desc = "copy handout to student";

    const id = this.course_actions.set_activity({ desc });
    const finish = (err?) => {
      this.course_actions.clear_activity(id);
      if (err) {
        err = `${short_desc}: ${err}`;
        this.course_actions.set_error(err);
      }
    };
    const { store, handout } = this.course_actions.resolve({ handout_id, finish });
    if (!handout) return;

    let errors = "";
    const f = async (student_id: string): Promise<void> => {
      if (new_only && store.handout_last_copied(handout_id, student_id)) {
        return;
      }
      try {
        await this.copy_handout_to_student(handout_id, student_id, overwrite);
      } catch (err) {
        errors += `\n ${err}`;
      }
    };

    await map(store.get_student_ids({ deleted: false }), PARALLEL_LIMIT, f);

    finish(errors);
  }

  public open_handout(handout_id: string, student_id: string): void {
    const { handout, student } = this.course_actions.resolve({
      handout_id,
      student_id
    });
    if (student == null || handout == null) return;
    const student_project_id = student.get("project_id");
    if (student_project_id == null) {
      this.course_actions.set_error(
        "open_handout: student project not yet created"
      );
      return;
    }
    const path = handout.get("target_path");
    const proj = student_project_id;
    if (proj == null) {
      this.course_actions.set_error("no such project");
      return;
    }
    // Now open it
    redux.getProjectActions(proj).open_directory(path);
  }
}
