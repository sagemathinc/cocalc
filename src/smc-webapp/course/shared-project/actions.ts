/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Actions that are specific to the shared project.
*/

import { redux } from "../../app-framework";

import { CourseActions } from "../actions";
import { CourseStore } from "../store";

import { DEFAULT_COMPUTE_IMAGE } from "smc-util/compute-images";
import { Datastore } from "../../projects/actions";

export class SharedProjectActions {
  private actions: CourseActions;

  constructor(actions: CourseActions) {
    this.actions = actions;
  }

  private get_store(): CourseStore {
    const store = this.actions.get_store();
    if (store == null) throw Error("no store");
    return store;
  }

  // return the default title and description of the shared project.
  private settings(): { title: string; description: string; image?: string } {
    const settings = this.get_store().get("settings");
    return {
      title: `Shared Project -- ${settings.get("title")}`,
      description:
        settings.get("description") +
        "\n\n---\n\nThis project is shared with all students in the course.",
      image: settings.get("custom_image"),
    };
  }

  public set_project_title(): void {
    const store = this.get_store();
    if (store == null) return;
    const shared_id = store.get_shared_project_id();
    if (!shared_id) return;
    const { title } = this.settings();
    redux.getActions("projects").set_project_title(shared_id, title);
  }

  public set_project_description(): void {
    const store = this.get_store();
    if (store == null) return;
    const shared_id = store.get_shared_project_id();
    if (!shared_id) return;

    const { description } = this.settings();
    redux
      .getActions("projects")
      .set_project_description(shared_id, description);
  }

  // start the shared project running, stopping, etc. (if it exists)
  public async action_shared_project(action: "start" | "stop"): Promise<void> {
    const store = this.get_store();
    if (store == null) {
      return;
    }
    const shared_project_id = store.get_shared_project_id();
    if (!shared_project_id) {
      return; // no shared project
    }
    const a = redux.getActions("projects");
    if (a == null) return;
    const f = a[action + "_project"].bind(a);
    if (f == null) return;
    await f(shared_project_id);
  }

  // configure the shared project so that it has everybody as collaborators
  public async configure(): Promise<void> {
    const store = this.get_store();
    const shared_project_id = store.get_shared_project_id();
    if (!shared_project_id) {
      return; // no shared project
    }
    const id = this.actions.set_activity({
      desc: "Configuring shared project...",
    });
    try {
      await this.set_project_title();
      // add collabs -- all collaborators on course project and all students
      const projects = redux.getStore("projects");
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
            student_account_ids[account_id] = true;
          }
        }
      });

      // Each of shared_project_users or course_project_users are
      // immutable.js maps from account_id's to something, and students is a map from
      // the student account_id's.
      // Our goal is to ensure that:
      //   {shared_project_users} = {course_project_users} union {students}.

      const actions = redux.getActions("projects");
      if (!store.get_allow_collabs()) {
        // Ensure the shared project users are all either course or students
        for (const account_id in shared_project_users.toJS()) {
          if (
            !course_project_users.get(account_id) &&
            !student_account_ids[account_id]
          ) {
            await actions.remove_collaborator(shared_project_id, account_id);
          }
        }
      }
      // Ensure every course project user is on the shared project
      for (const account_id in course_project_users.toJS()) {
        if (!shared_project_users.get(account_id)) {
          await actions.invite_collaborator(shared_project_id, account_id);
        }
      }
      // Ensure every student is on the shared project
      for (const account_id in student_account_ids) {
        if (!shared_project_users.get(account_id)) {
          await actions.invite_collaborator(shared_project_id, account_id);
        }
      }

      // Set license key(s) on the shared project too, if there is one
      // NOTE: we never remove it or any other licenses from the shared project,
      // since instructor may want to augment license with another.
      const site_license_id = store.getIn(["settings", "site_license_id"]);
      if (site_license_id) {
        await actions.add_site_license_to_project(
          shared_project_id,
          site_license_id
        );
      }

      // Also set the compute image
      await this.set_project_compute_image();
    } catch (err) {
      this.actions.set_error(`Error configuring shared project - ${err}`);
    } finally {
      this.actions.set_activity({ id });
    }
  }

  public async set_project_compute_image(): Promise<void> {
    const store = this.get_store();
    const shared_project_id = store.get_shared_project_id();
    if (!shared_project_id) {
      return; // no shared project
    }
    const img_id =
      store.get("settings").get("custom_image") ?? DEFAULT_COMPUTE_IMAGE;
    const actions = redux.getProjectActions(shared_project_id);
    await actions.set_compute_image(img_id);
  }

  public async set_datastore(): Promise<void> {
    const store = this.get_store();
    const shared_project_id = store.get_shared_project_id();
    if (!shared_project_id) {
      return; // no shared project
    }
    const datastore: Datastore = store.get_datastore();
    const actions = redux.getActions("projects");
    await actions.set_project_course_info(
      shared_project_id,
      store.get("course_project_id"),
      store.get("course_filename"),
      "", // pay
      null, // account_id
      null, // email_address
      datastore,
      true // shared project
    );
  }

  // set the shared project id in our syncdb
  private set_project_id(shared_project_id: string): void {
    this.actions.set({
      table: "settings",
      shared_project_id,
    });
  }

  // create the globally shared project if it doesn't exist
  public async create(): Promise<void> {
    const store = this.get_store();
    if (store.get_shared_project_id()) {
      return;
    }
    const id = this.actions.set_activity({
      desc: "Creating shared project...",
    });
    let project_id: string;
    try {
      project_id = await redux
        .getActions("projects")
        .create_project(this.settings());
    } catch (err) {
      this.actions.set_error(`error creating shared project -- ${err}`);
      return;
    } finally {
      this.actions.set_activity({ id });
    }
    this.set_project_id(project_id);
    await this.configure();
  }

  // Delete the shared project, removing students too.
  public async delete(): Promise<void> {
    const store = this.get_store();
    const shared_id = store.get_shared_project_id();
    if (!shared_id) {
      return;
    }
    const project_actions = redux.getActions("projects");
    // delete project
    await project_actions.delete_project(shared_id);

    // remove student collabs
    const ids = store.get_student_ids({ deleted: false });
    if (ids == undefined) {
      return;
    }
    for (const student_id of ids) {
      const student_account_id = store.unsafe_getIn([
        "students",
        student_id,
        "account_id",
      ]);
      if (student_account_id) {
        await project_actions.remove_collaborator(
          shared_id,
          student_account_id
        );
      }
    }
    // make the course itself forget about the shared project:
    this.actions.set({
      table: "settings",
      shared_project_id: "",
    });
  }
}
