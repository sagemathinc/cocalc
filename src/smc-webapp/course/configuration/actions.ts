/*
Actions involving configuration of the course.
*/

import { SyncDBRecord, UpgradeGoal } from "../types";
import { CourseActions } from "../actions";
import { redux } from "../../app-framework";
import { reuseInFlight } from "async-await-utils/hof";

export class ConfigurationActions {
  private course_actions: CourseActions;

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

  public set_site_license_id(site_license_id: string): void {
    this.set({ site_license_id, table: "settings" });
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

  public set_email_invite(body: string): void {
    this.set({ email_invite: body, table: "settings" });
  }

  // Set the pay option for the course, and ensure that the course fields are
  // set on every student project in the course (see schema.coffee for format
  // of the course field) to reflect this change in the database.
  public async set_course_info(pay: string = ""): Promise<void> {
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
    }); // Set license key if known; remove if not.
    try {
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
    await this.course_actions.shared_project.configure();
    await this.configure_host_project();
    await this.course_actions.student_projects.configure_all_projects(force);
  }

  public async push_missing_handouts_and_assignments(): Promise<void> {
    const store = this.course_actions.get_store();
    for (const student_id of store.get_student_ids({ deleted: false })) {
      await this.course_actions.students.push_missing_handouts_and_assignments(
        student_id
      );
    }
  }

  public set_nbgrader_grade_in_instructor_project(value: boolean): void {
    this.set({
      nbgrader_grade_in_instructor_project: value,
      table: "settings",
    });
  }

  public set_nbgrader_cell_timeout_ms(value: number): void {
    this.set({
      nbgrader_cell_timeout_ms: value,
      table: "settings",
    });
  }

  public set_nbgrader_timeout_ms(value: number): void {
    this.set({
      nbgrader_timeout_ms: value,
      table: "settings",
    });
  }
}
