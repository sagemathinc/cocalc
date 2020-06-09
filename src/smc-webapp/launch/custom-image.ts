/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this either creates a new project for a given CSI ID,
// or picks up the most recent project of that user
//
// testing: app?launch=csi/course-calculate-20

import { redux } from "../app-framework";
import { analytics_event } from "../tracker";
import { uuid } from "smc-util/misc2";
import { retry_until_success } from "smc-util/async-utils";
import {
  custom_image_name,
  NAME as CUSTOM_SOFTWARE_NAME,
} from "../custom-software/util";
import { init } from "../custom-software/init";
import { alert_message } from "../alerts";

export class CSILauncher {
  private readonly image_id;
  private actions;
  private custom_software_table;

  constructor(image_id: string) {
    // processing e.g. "?launch=csi/opencv-machine-learning",
    // where the ID is a valid docker ID (lowercase, dashes)
    this.image_id = image_id;
  }

  // returns project_id or if there is a problem, undefined
  async launch(): string | undefined {
    this.custom_software_table = await this.get_csi_table();
    if (!this.custom_software_table._table.value.has(this.image_id)) {
      alert_message({
        type: "error",
        title: "Custom Software Image not found.",
        message: `There is no custom software image with the ID "${this.image_id}".`,
        block: true,
      });
      return;
    }

    // this is mimicing what's going on in projects/create-project.tsx
    this.actions = await this.get_project_actions();

    const project_id = await this.find_project();

    if (project_id != null) {
      this.actions.open_project({ project_id, switch_to: true });
      return project_id;
    } else {
      return this.create_project();
    }
  }

  private async get_csi_table() {
    init();
    return await retry_until_success({
      f: async () => {
        const cst = redux.getTable(CUSTOM_SOFTWARE_NAME);
        if (cst?._table?.value == null)
          throw new Error("custom software table not yet available...");
        // what is this doing? do we need it?
        //await once(cst._table, "connected");
        return cst;
      },
    });
  }

  private async get_project_actions() {
    return await retry_until_success({
      f: async () => {
        const projects_table = redux.getTable("projects");
        if (projects_table == null)
          throw new Error("Projects Table not yet available...");
        // what is this doing?  do we need it?
        // await once(projects_table._table, "connected");
        const actions = redux.getActions("projects");
        if (actions == null)
          throw new Error("Projects Actions not yet available...");
        return actions;
      },
    });
  }

  private async find_project(): Promise<string | undefined> {
    await this.actions.load_all_projects();
    const store = redux.getStore("projects");
    const projs = store.get_by_compute_image(this.image_id);
    if (projs.isEmpty()) {
      return undefined;
    } else {
      // return the one with the highest (newest) created timestamp
      const project = projs
        .sortBy((p) => {
          const created = p.get("created");
          return created != null ? created.getTime() : 0;
        })
        .last();
      return project.get("project_id");
    }
  }

  private async create_project(): Promise<string> {
    const token = uuid();

    const title =
      this.custom_software_table._table.get(this.image_id).get("display") ||
      this.image_id;

    // TODO pick the proper title from the custom image table
    const project_id = await this.actions.create_project({
      title,
      image: custom_image_name(this.image_id),
      token,
    });

    // if we have project actions, we can assume project store also exists?
    redux
      .getStore("projects")
      .wait_until_project_created(token, 30, (err, project_id) => {
        if (err != null) {
          alert_message({
            type: "error",
            title: "Unable to create project.",
            message: `The error is "${err}".`,
            block: true,
          });
        } else {
          this.actions.apply_default_upgrades({ project_id });
          this.actions.open_project({ project_id, switch_to: true });
        }
      });

    analytics_event("create_project", "launch_csi");

    return project_id;
  }
}
