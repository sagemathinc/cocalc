import { redux } from "../app-framework";
import { analytics_event } from "../tracker";
import { uuid } from "smc-util/misc2";
import { retry_until_success, once } from "smc-util/async-utils";
import {
  custom_image_name,
  NAME as CUSTOM_SOFTWARE_NAME,
} from "../custom-software/init";

export async function launch_custom_software_image(
  launch: string
): Promise<void> {
  // processing e.g. "?launch=csi/opencv-machine-learning",
  // where the ID is a valid docker ID (lowercase, dashes)
  const image_id = launch.split("/")[1];
  // console.log(`launching custom software image with ID = ${image_id}`);

  const custom_software_table = await retry_until_success({
    f: async () => {
      const cst = redux.getTable(CUSTOM_SOFTWARE_NAME);
      if (cst == null)
        throw new Error("custom software table not yet available...");
      // what is this doing?
      await once(cst._table, "connected");
      return cst;
    },
  });

  if (!custom_software_table._table.value.has(image_id)) {
    console.error(
      `There is no custom software image with the ID "${image_id}"`
    );
    return;
  }

  // this is mimicing what's going on in projects/create-project.tsx
  const actions = await retry_until_success({
    f: async () => {
      const projects_table = redux.getTable("projects");
      if (projects_table == null)
        throw new Error("Projects Table not yet available...");
      // what is this doing?
      await once(projects_table._table, "connected");
      const actions = redux.getActions("projects");
      if (actions == null)
        throw new Error("Projects Actions not yet available...");
      return actions;
    },
  });

  const token = uuid();

  // TODO pick the proper title from the custom image table
  actions.create_project({
    title: image_id,
    image: custom_image_name(image_id),
    token,
  });

  // if we have project actions, we can assume project store also exists?
  redux
    .getStore("projects")
    .wait_until_project_created(token, 30, (err, project_id) => {
      if (err != null) {
        console.error(`Error creating project -- ${err}`);
      } else {
        actions.apply_default_upgrades({ project_id });
        actions.open_project({ project_id, switch_to: true });
      }
    });

  analytics_event("create_project", "launch_csi");
}
