/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Actions involving configuration of the course.
*/

import { webapp_client } from "../../webapp-client";
import { SiteLicenseStrategy, SyncDBRecord, UpgradeGoal } from "../types";
import { CourseActions } from "../actions";
import { store as projects_store } from "../../projects/store";
import { redux } from "../../app-framework";
import { reuseInFlight } from "async-await-utils/hof";
import {
  SoftwareEnvironmentState,
  derive_project_img_name,
} from "../../custom-software/selector";
import { Datastore } from "../../projects/actions";
import { StudentProjectFunctionality } from "./customize-student-project-functionality";

export class ConfigurationActions {
  private course_actions: CourseActions;
  private configuring: boolean = false;
  private configureAgain: boolean = false;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
    this.push_missing_handouts_and_assignments = reuseInFlight(
      this.push_missing_handouts_and_assignments
    );
  }

  public set(obj: SyncDBRecord, commit: boolean = true): void {
    this.course_actions.set(obj, commit);
  }

  public set_title(title: string): void {
    this.set({ title, table: "settings" });
    this.course_actions.student_projects.set_all_student_project_titles(title);
    this.course_actions.shared_project.set_project_title();
  }

  public set_description(description: string): void {
    this.set({ description, table: "settings" });
    this.course_actions.student_projects.set_all_student_project_descriptions(
      description
    );
    this.course_actions.shared_project.set_project_description();
  }

  // NOTE: site_license_id can be a single id, or multiple id's separate by a comma.
  public add_site_license_id(license_id: string): void {
    const store = this.course_actions.get_store();
    let site_license_id = store.getIn(["settings", "site_license_id"]) ?? "";
    if (site_license_id.indexOf(license_id) != -1) return; // already known
    site_license_id += (site_license_id.length > 0 ? "," : "") + license_id;
    this.set({ site_license_id, table: "settings" });
  }

  public remove_site_license_id(license_id: string): void {
    const store = this.course_actions.get_store();
    let cur = store.getIn(["settings", "site_license_id"]) ?? "";
    let removed = store.getIn(["settings", "site_license_removed"]) ?? "";
    if (cur.indexOf(license_id) == -1) return; // already removed
    const v: string[] = [];
    for (const id of cur.split(",")) {
      if (id != license_id) {
        v.push(id);
      }
    }
    const site_license_id = v.join(",");
if (!removed.includes(license_id)) {
      removed = removed.split(",").concat([license_id]).join(",");
    }
    this.set({
      site_license_id,
      site_license_removed: removed,
      table: "settings",
    });
  }

  public set_site_license_strategy(
    site_license_strategy: SiteLicenseStrategy
  ): void {
    this.set({ site_license_strategy, table: "settings" });
  }

  public set_pay_choice(type: string, value: boolean): void {
    this.set({ [type + "_pay"]: value, table: "settings" });
    if (type == "student") {
      if (value) {
        this.course_actions.student_projects.set_all_student_project_course_info();
      } else {
        this.course_actions.student_projects.set_all_student_project_course_info(
          ""
        );
      }
    }
  }

  public set_upgrade_goal(upgrade_goal: UpgradeGoal): void {
    this.set({ upgrade_goal, table: "settings" });
  }

  public set_allow_collabs(allow_collabs: boolean): void {
    this.set({ allow_collabs, table: "settings" });
    this.course_actions.student_projects.configure_all_projects();
  }

  public async set_student_project_functionality(
    student_project_functionality: StudentProjectFunctionality
  ): Promise<void> {
    this.set({ student_project_functionality, table: "settings" });
    await this.course_actions.student_projects.configure_all_projects();
  }

  public set_email_invite(body: string): void {
    this.set({ email_invite: body, table: "settings" });
  }

  // Set the pay option for the course, and ensure that the course fields are
  // set on every student project in the course (see schema.coffee for format
  // of the course field) to reflect this change in the database.
  public async set_course_info(pay: string | Date = ""): Promise<void> {
    if (typeof pay != "string") {
      pay = pay.toISOString();
    }
    this.set({
      pay,
      table: "settings",
    });
    await this.course_actions.student_projects.set_all_student_project_course_info(
      pay
    );
  }

  public async configure_host_project(): Promise<void> {
    const id = this.course_actions.set_activity({
      desc: "Configuring host project.",
    });
    try {
      // NOTE: we never remove it or any other licenses from the host project,
      // since instructor may want to augment license with another license.
      const store = this.course_actions.get_store();
      const site_license_id = store.getIn(["settings", "site_license_id"]);
      const actions = redux.getActions("projects");
      const course_project_id = store.get("course_project_id");
      if (site_license_id) {
        await actions.add_site_license_to_project(
          course_project_id,
          site_license_id
        );
      }
    } catch (err) {
      this.course_actions.set_error(`Error configuring host project - ${err}`);
    } finally {
      this.course_actions.set_activity({ id });
    }
  }

  public async configure_all_projects(force: boolean = false): Promise<void> {
    if (this.configuring) {
      // Important -- if configure_all_projects is called *while* it is running,
      // wait until it is done, then call it again (though I'm being lazy about the
      // await!).  Don't do the actual work more than once
      // at the same time since that might confuse the db writes, but
      // also don't just reuse in flight, which will miss the later calls.
      this.configureAgain = true;
      return;
    }
    try {
      this.configureAgain = false;
      this.configuring = true;
      await this.course_actions.shared_project.configure();
      await this.configure_host_project();
      await this.course_actions.student_projects.configure_all_projects(force);
      await this.configure_nbgrader_grade_project();
    } finally {
      this.configuring = false;
      if (this.configureAgain) {
        this.configureAgain = false;
        this.configure_all_projects();
      }
    }
  }

  public async push_missing_handouts_and_assignments(): Promise<void> {
    const store = this.course_actions.get_store();
    for (const student_id of store.get_student_ids({ deleted: false })) {
      await this.course_actions.students.push_missing_handouts_and_assignments(
        student_id
      );
    }
  }

  public set_copy_parallel(copy_parallel: number): void {
    this.set({
      copy_parallel,
      table: "settings",
    });
  }

  public async configure_nbgrader_grade_project(
    project_id?: string
  ): Promise<void> {
    const store = this.course_actions.get_store();

    if (project_id == null) {
      project_id = store.getIn(["settings", "nbgrader_grade_project"]);
    }
    if (project_id == null || project_id == "") return;

    const id = this.course_actions.set_activity({
      desc: "Configuring grading project.",
    });

    try {
      // make sure the course config for that nbgrader project (mainly for the datastore!) is set
      const datastore: Datastore = store.get_datastore();
      const projects_actions = redux.getActions("projects");

      // if for some reason this is a student project, we don't want to reconfigure it
      const course_info: any = projects_store
        .get_course_info(project_id)
        ?.toJS();
      if (course_info?.type == null || course_info.type == "nbgrader") {
        await projects_actions.set_project_course_info(
          project_id,
          store.get("course_project_id"),
          store.get("course_filename"),
          "", // pay
          null, // account_id
          null, // email_address
          datastore,
          "nbgrader" // type of project
        );
      }

      // we also make sure all teachers have access to that project – otherwise NBGrader can't work, etc.
      // this has to happen *after* setting the course field, extended access control, ...
      const ps = redux.getStore("projects");
      const teachers = ps.get_users(store.get("course_project_id"));
      const users_of_grade_project = ps.get_users(project_id);
      if (users_of_grade_project != null && teachers != null) {
        for (const account_id of teachers.keys()) {
          const user = users_of_grade_project.get(account_id);
          if (user != null) continue;
          await webapp_client.project_collaborators.add_collaborator({
            account_id,
            project_id,
          });
        }
      }
    } catch (err) {
      this.course_actions.set_error(
        `Error configuring grading project - ${err}`
      );
    } finally {
      this.course_actions.set_activity({ id });
    }
  }

  // project_id is a uuid *or* empty string.
  public async set_nbgrader_grade_project(project_id: string): Promise<void> {
    this.set({
      nbgrader_grade_project: project_id,
      table: "settings",
    });

    // not empty string → configure that grading project
    if (project_id) {
      await this.configure_nbgrader_grade_project(project_id);
    }
  }

  public set_nbgrader_cell_timeout_ms(nbgrader_cell_timeout_ms: number): void {
    this.set({
      nbgrader_cell_timeout_ms,
      table: "settings",
    });
  }

  public set_nbgrader_timeout_ms(nbgrader_timeout_ms: number): void {
    this.set({
      nbgrader_timeout_ms,
      table: "settings",
    });
  }

  public set_nbgrader_max_output(nbgrader_max_output: number): void {
    this.set({
      nbgrader_max_output,
      table: "settings",
    });
  }

  public set_nbgrader_max_output_per_cell(
    nbgrader_max_output_per_cell: number
  ): void {
    this.set({
      nbgrader_max_output_per_cell,
      table: "settings",
    });
  }

  public set_nbgrader_include_hidden_tests(value: boolean): void {
    this.set({
      nbgrader_include_hidden_tests: value,
      table: "settings",
    });
  }

  public set_inherit_compute_image(image?: string): void {
    this.set({ inherit_compute_image: image != null, table: "settings" });
    if (image != null) {
      this.set_compute_image(image);
    }
  }

  public set_compute_image(image: string) {
    this.set({
      custom_image: image,
      table: "settings",
    });
    this.course_actions.student_projects.configure_all_projects();
    this.course_actions.shared_project.set_project_compute_image();
  }

  public set_software_environment(state: SoftwareEnvironmentState): void {
    const image = derive_project_img_name(state);
    this.set_compute_image(image);
  }

  public set_nbgrader_parallel(nbgrader_parallel: number): void {
    this.set({
      nbgrader_parallel,
      table: "settings",
    });
  }

  public set_datastore(datastore: Datastore): void {
    this.set({ datastore, table: "settings" });
    this.course_actions.student_projects.configure_all_projects();
    this.course_actions.shared_project.set_datastore();
    // in case there is one, we have to set the datastore as well
    this.configure_nbgrader_grade_project();
  }
}
