/*
Synctable that uses the project websocket rather than the database.
*/

import { synctable_no_database, SyncTable } from "smc-util/sync/table";

const { is_array } = require("smc-util/misc");

import { once } from "smc-util/async-utils";

export async function synctable_project(
  project_id,
  query,
  options,
  client,
  throttle_changes?: undefined | number
): Promise<SyncTable> {
  // wake up the project
  client.touch_project({project_id});
  const synctable = synctable_no_database(
    query,
    options,
    client,
    throttle_changes
  );
  const api = (await client.project_websocket(project_id)).api;
  const channel = await api.synctable_channel(query, options);
  let first_data = true;
  channel.on("data", function(data) {
    if (!is_array(data)) {
      if (data != null && data.error != null) {
        throw Error(`synctable_project error - ${data.error}`);
      }
      console.warn("data = ", data);
      throw Error("data must be an array");
    }
    for (let x of data) {
      synctable.set(x);
    }
    if (first_data) {
      synctable.emit("project-ready");
      first_data = false;
    }
  });
  synctable.on("saved-objects", function(saved_objs) {
    channel.write(saved_objs);
  });

  await once(synctable, "project-ready");
  return synctable;
}
