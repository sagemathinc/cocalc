/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Actions specific to manipulating the student projects that students have in a course.
*/

import { delay } from "awaiting";
import { CourseActions, EMAIL_REINVITE_DAYS } from "../actions";
import { CourseStore } from "../store";
import { webapp_client } from "../../webapp-client";
import { redux } from "../../app-framework";
import { len, copy, days_ago } from "smc-util/misc";
import { SITE_NAME } from "smc-util/theme";
import { markdown_to_html } from "../../markdown";
import { UpgradeGoal } from "../types";
import { run_in_all_projects, Result } from "./run-in-all-projects";
import { DEFAULT_COMPUTE_IMAGE } from "smc-util/compute-images";

export class StudentProjectsActions {
  private course_actions: CourseActions;

  constructor(course_actions: CourseActions) {
    this.course_actions = course_actions;
  }

  private get_store(): CourseStore {
    const store = this.course_actions.get_store();
    if (store == null) throw Error("no store");
    return store;
  }

  // Create a single student project.
  public async create_student_project(
    student_id: string
  ): Promise<string | undefined> {
    const { store, student } = this.course_actions.resolve({
      student_id,
      finish: this.course_actions.set_error.bind(this),
    });
    if (store == null || student == null) return;
    if (store.get("students") == null || store.get("settings") == null) {
      this.course_actions.set_error(
        "BUG: attempt to create when stores not yet initialized"
      );
      return;
    }
    if (student.get("project_id")) {
      // project already created.
      return student.get("project_id");
    }
    this.course_actions.set({
      create_project: webapp_client.server_time(),
      table: "students",
      student_id,
    });
    const id = this.course_actions.set_activity({
      desc: `Create project for ${store.get_student_name(student_id)}.`,
    });
    let project_id: string;
    try {
      project_id = await redux.getActions("projects").create_project({
        title: store.get("settings").get("title"),
        description: store.get("settings").get("description"),
        image:
          store.get("settings").get("custom_image") ?? DEFAULT_COMPUTE_IMAGE,
      });
    } catch (err) {
      this.course_actions.set_error(
        `error creating student project for ${store.get_student_name(
          student_id
        )} -- ${err}`
      );
      return;
    } finally {
      this.course_actions.clear_activity(id);
    }
    this.course_actions.set({
      create_project: null,
      project_id,
      table: "students",
      student_id,
    });
    await this.configure_project(student_id, false, project_id);
    return project_id;
  }

  private async configure_project_users(
    student_project_id,
    student_id,
    do_not_invite_student_by_email,
    force_send_invite_by_email
  ): Promise<void> {
    //console.log("configure_project_users", student_project_id, student_id)
    // Add student and all collaborators on this project to the project with given project_id.
    // users = who is currently a user of the student's project?
    const users = redux.getStore("projects").get_users(student_project_id); // immutable.js map
    if (users == null) return; // can't do anything if this isn't known...

    const s = this.get_store();
    if (s == null) return;
    const student = s.get_student(student_id);
    if (student == null) return; // no such student..

    let site_name = redux.getStore("customize").get("site_name");
    if (!site_name) {
      site_name = SITE_NAME;
    }
    let body = s.get_email_invite();

    // Define function to invite or add collaborator
    const invite = async (x) => {
      // console.log("invite", x, " to ", student_project_id);
      const account_store = redux.getStore("account");
      const name = account_store.get_fullname();
      const replyto = account_store.get_email_address();
      if (x.includes("@")) {
        if (!do_not_invite_student_by_email) {
          const title = s.get("settings").get("title");
          const subject = `${site_name} Invitation to Course ${title}`;
          body = body.replace(/{title}/g, title).replace(/{name}/g, name);
          body = markdown_to_html(body);
          await redux
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
        await redux
          .getActions("projects")
          .invite_collaborator(student_project_id, x);
      }
    };
    // Make sure the student is on the student's project:
    const student_account_id = student.get("account_id");
    if (student_account_id == null) {
      // No known account yet, so invite by email.  That said,
      // we only do this at most once every few days.
      const last_email_invite = student.get("last_email_invite");
      if (
        force_send_invite_by_email ||
        !last_email_invite ||
        new Date(last_email_invite) < days_ago(EMAIL_REINVITE_DAYS)
      ) {
        await invite(student.get("email_address"));
        this.course_actions.set({
          table: "students",
          student_id,
          last_email_invite: new Date().valueOf(),
        });
      }
    } else if (
      (users != null ? users.get(student_account_id) : undefined) == null
    ) {
      // users might not be set yet if project *just* created
      await invite(student_account_id);
    }
    // Make sure all collaborators on course project are on the student's project:
    const course_collaborators = redux
      .getStore("projects")
      .get_users(s.get("course_project_id"));
    if (course_collaborators == null) {
      // console.log("projects store isn't sufficiently initialized yet...");
      return;
    }
    for (const account_id of course_collaborators.keys()) {
      if (!users.has(account_id)) {
        await invite(account_id);
      }
    }

    // Set license key if known; remove if not.
    const site_license_id = s.getIn(["settings", "site_license_id"]);
    const licenses = site_license_id.split(",");
    const strategy = s.getIn(["settings", "site_license_strategy"]);
    const actions = redux.getActions("projects");
    if (strategy == "parallel" || licenses.length <= 1) {
      // EASY case.
      // NOTE: if students were to add their own extra license, this is going to remove it.
      // TODO: it would be nice to recognize that case, and not remove licenses managed by
      // somebody else or something.  But this is not easy to get right, and students maybe
      // never do this (?).
      await actions.set_site_license(student_project_id, site_license_id);
    } else {
      // serial is the only other (and the default) strategy.
    }

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
      for (const account_id of users.keys()) {
        if (
          !course_collaborators.has(account_id) &&
          account_id !== student_account_id
        ) {
          await redux
            .getActions("projects")
            .remove_collaborator(student_project_id, account_id);
        }
      }
    }
  }

  private async configure_project_visibility(
    student_project_id: string
  ): Promise<void> {
    const users_of_student_project = redux
      .getStore("projects")
      .get_users(student_project_id);
    if (users_of_student_project == null) {
      // e.g., not defined in admin view mode
      return;
    }
    // Make project not visible to any collaborator on the course project.
    const store = this.get_store();
    if (store == undefined) {
      return;
    }
    const users = redux
      .getStore("projects")
      .get_users(store.get("course_project_id"));
    if (users == null) {
      // TODO: should really wait until users is defined, which is a supported thing to do on stores!
      return;
    }
    for (const account_id of users.keys()) {
      const x = users_of_student_project.get(account_id);
      if (x != null && !x.get("hide")) {
        await redux
          .getActions("projects")
          .set_project_hide(account_id, student_project_id, true);
      }
    }
  }

  private async configure_project_title(
    student_project_id: string,
    student_id: string
  ): Promise<void> {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const title = `${store.get_student_name(student_id)} - ${store
      .get("settings")
      .get("title")}`;
    await redux
      .getActions("projects")
      .set_project_title(student_project_id, title);
  }

  // start or stop projects of all (non-deleted) students running
  public action_all_student_projects(action: "start" | "stop"): void {
    if (action == "start") {
      this.course_actions.setState({ action_all_projects_state: "starting" });
    } else if (action === "stop") {
      this.course_actions.setState({ action_all_projects_state: "stopping" });
    }

    this.course_actions.shared_project.action_shared_project(action);

    const store = this.get_store();

    const projects_actions = redux.getActions("projects");
    if (projects_actions == null) {
      throw Error("projects actions must be defined");
    }
    let f = projects_actions[action + "_project"];
    if (f == null) {
      throw Error(`invalid action "${action}"`);
    }
    f = f.bind(projects_actions);
    for (const [, student] of store.get_students()) {
      if (student.get("deleted")) continue;
      const project_id = student.get("project_id");
      if (!project_id) continue;
      f(project_id);
    }
  }

  public cancel_action_all_student_projects(): void {
    this.course_actions.setState({ action_all_projects_state: "any" });
  }

  public async run_in_all_student_projects(
    command: string,
    args?: string[],
    timeout?: number,
    log?: Function
  ): Promise<Result[]> {
    const store = this.get_store();
    // calling start also deals with possibility that
    // it's in stop state.
    this.action_all_student_projects("start");
    return await run_in_all_projects(
      // as string[] is right since map option isn't set (make typescript happy)
      store.get_student_project_ids(),
      command,
      args,
      timeout,
      log
    );
  }

  public async set_all_student_project_titles(title: string): Promise<void> {
    const actions = redux.getActions("projects");
    const store = this.get_store();
    for (const student of store.get_students().valueSeq().toArray()) {
      const student_project_id = student.get("project_id");
      const project_title = `${store.get_student_name(
        student.get("student_id")
      )} - ${title}`;
      if (student_project_id != null) {
        await actions.set_project_title(student_project_id, project_title);
        if (this.course_actions.is_closed()) return;
      }
    }
  }

  private async configure_project_description(
    student_project_id: string
  ): Promise<void> {
    const store = this.get_store();
    await redux
      .getActions("projects")
      .set_project_description(
        student_project_id,
        store.getIn(["settings", "description"])
      );
  }

  public async set_all_student_project_descriptions(
    description: string
  ): Promise<void> {
    const store = this.get_store();
    const actions = redux.getActions("projects");
    for (const student of store.get_students().valueSeq().toArray()) {
      const student_project_id = student.get("project_id");
      if (student_project_id != null) {
        await actions.set_project_description(student_project_id, description);
        if (this.course_actions.is_closed()) return;
      }
    }
  }

  public async set_all_student_project_course_info(
    pay?: string | Date | undefined
  ): Promise<void> {
    const store = this.get_store();
    if (pay == null) {
      // read pay from syncdb then do the configuration below
      pay = store.get_pay();
      if (pay == null) {
        pay = "";
      }
    } else {
      // setting pay in the syncdb, and will then later
      // do some configu below.
      if (pay instanceof Date) {
        pay = pay.toISOString();
      }
      this.course_actions.set({
        pay,
        table: "settings",
      });
    }

    if (pay != "" && !(pay instanceof Date)) {
      // pay *must* be a Date, not just a string timestamp... or "" for not paying.
      pay = new Date(pay);
    }
    const actions = redux.getActions("projects");
    const id = this.course_actions.set_activity({
      desc: "Updating project course info...",
    });
    try {
      for (const student of store.get_students().valueSeq().toArray()) {
        const student_project_id = student.get("project_id");
        if (student_project_id == null) continue;
        // account_id: might not be known when student first added, or if student
        // hasn't joined smc yet, so there is no account_id for them.
        const student_account_id = student.get("account_id");
        const student_email_address = student.get("email_address"); // will be known if account_id isn't known.
        await actions.set_project_course_info(
          student_project_id,
          store.get("course_project_id"),
          store.get("course_filename"),
          pay,
          student_account_id,
          student_email_address
        );
      }
    } finally {
      this.course_actions.set_activity({ id });
    }
  }

  private async configure_project(
    student_id,
    do_not_invite_student_by_email,
    student_project_id?: string,
    force_send_invite_by_email?: boolean,
    license_strategy?: { [license_id: string]: number } // relevant for serial license strategy only
  ): Promise<void> {
    // student_project_id is optional. Will be used instead of from student_id store if provided.
    // Configure project for the given student so that it has the right title,
    // description, and collaborators for belonging to the indicated student.
    // - Add student and collaborators on project containing this course to the new project.
    // - Hide project from owner/collabs of the project containing the course.
    // - Set the title to [Student name] + [course title] and description to course description.
    // console.log("configure_project", student_id);
    const store = this.get_store();
    if (student_project_id == null) {
      student_project_id = store.getIn(["students", student_id, "project_id"]);
    }
    // console.log("configure_project", student_id, student_project_id);
    if (student_project_id == null) {
      await this.create_student_project(student_id);
    } else {
      await Promise.all([
        this.configure_project_users(
          student_project_id,
          student_id,
          do_not_invite_student_by_email,
          force_send_invite_by_email
        ),
        this.configure_project_visibility(student_project_id),
        this.configure_project_title(student_project_id, student_id),
        this.configure_project_description(student_project_id),
        this.configure_project_compute_image(student_project_id),
      ]);
    }
  }

  private async configure_project_compute_image(
    student_project_id: string
  ): Promise<void> {
    const store = this.get_store();
    if (store == null) return;
    const img_id =
      store.get("settings").get("custom_image") ?? DEFAULT_COMPUTE_IMAGE;
    const actions = redux.getProjectActions(student_project_id);
    await actions.set_compute_image(img_id);
  }

  private async delete_student_project(student_id: string): Promise<void> {
    const store = this.get_store();
    const student_project_id = store.getIn([
      "students",
      student_id,
      "project_id",
    ]);
    if (student_project_id == null) return;
    const student_account_id = store.getIn([
      "students",
      student_id,
      "account_id",
    ]);
    if (student_account_id != undefined) {
      redux
        .getActions("projects")
        .remove_collaborator(student_project_id, student_account_id);
    }
    await redux.getActions("projects").delete_project(student_project_id);
    this.course_actions.set({
      create_project: null,
      project_id: null,
      table: "students",
      student_id,
    });
  }

  async configure_all_projects(force: boolean = false): Promise<void> {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    if (store.get("configuring_projects")) {
      // currently running already.
      return;
    }
    const license_strategy: { [license_id: string]: number } = {};
    if (store.getIn(["settings", "site_license_strategy"]) == "serial") {
    }

    let id: number = -1;
    try {
      this.course_actions.setState({ configuring_projects: true });
      id = this.course_actions.set_activity({
        desc: "Ensuring all projects are configured...",
      });
      const ids = store.get_student_ids({ deleted: false });
      if (ids == undefined) {
        return;
      }
      let i = 0;
      for (const student_id of ids) {
        if (this.course_actions.is_closed()) return;
        i += 1;
        const id1: number = this.course_actions.set_activity({
          desc: `Configuring student project ${i} of ${ids.length}`,
        });
        await this.configure_project(
          student_id,
          false,
          undefined,
          force,
          license_strategy
        );
        this.course_actions.set_activity({ id: id1 });
        await delay(0); // give UI, etc. a solid chance to render
      } // always re-invite students on running this.
      await this.course_actions.shared_project.configure();
      await this.set_all_student_project_course_info();
    } catch (err) {
      this.course_actions.set_error(
        `Error configuring student projects - ${err}`
      );
    } finally {
      if (this.course_actions.is_closed()) return;
      this.course_actions.setState({ configuring_projects: false });
      this.course_actions.set_activity({ id });
    }
  }

  // Deletes student projects and removes students from those projects
  public async delete_all_student_projects(): Promise<void> {
    const store = this.get_store();

    const id = this.course_actions.set_activity({
      desc: "Deleting all student projects...",
    });
    try {
      const ids = store.get_student_ids({ deleted: false });
      if (ids == undefined) {
        return;
      }
      for (const student_id of ids) {
        await this.delete_student_project(student_id);
      }
    } catch (err) {
      this.course_actions.set_error(
        `error deleting a student project... ${err}`
      );
    } finally {
      this.course_actions.set_activity({ id });
    }
  }

  // upgrade_goal is a map from the quota type to the goal quota the instructor wishes
  // to get all the students to.
  public async upgrade_all_student_projects(
    upgrade_goal: UpgradeGoal
  ): Promise<void> {
    const store = this.get_store();
    const plan = store.get_upgrade_plan(upgrade_goal);
    if (len(plan) === 0) {
      // nothing to do
      return;
    }
    const id = this.course_actions.set_activity({
      desc: `Adjusting upgrades on ${len(plan)} student projects...`,
    });
    const a = redux.getActions("projects");
    const s = redux.getStore("projects");
    for (const project_id in plan) {
      if (project_id == null) continue;
      const upgrades = plan[project_id];
      if (upgrades == null) continue;
      // avoid race if projects are being created *right* when we
      // try to upgrade them.
      if (!s.has_project(project_id)) continue;
      await a.apply_upgrades_to_project(project_id, upgrades, false);
    }
    this.course_actions.set_activity({ id });
  }

  // Do an admin upgrade to all student projects.  This changes the base quotas for every student
  // project as indicated by the quotas object.  E.g., to increase the core quota from 1 to 2, do
  //         .admin_upgrade_all_student_projects(cores:2)
  // The quotas are: cores, cpu_shares, disk_quota, memory, mintime, network, member_host
  public async admin_upgrade_all_student_projects(quotas): Promise<void> {
    const account_store = redux.getStore("account");
    const groups = account_store.get("groups");
    if (groups && groups.includes("admin")) {
      throw Error("must be an admin to upgrade");
    }
    const store = this.get_store();
    const ids: string[] = store.get_student_project_ids();
    for (const project_id of ids) {
      const x = copy(quotas);
      x.project_id = project_id;
      await webapp_client.project_client.set_quotas(x);
    }
  }
}
