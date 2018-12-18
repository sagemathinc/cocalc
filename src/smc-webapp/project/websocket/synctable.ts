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
  client.touch_project({ project_id });
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
    //console.log("recv: ", query, "channel=", channel.channel, "data=", data);
    if (!is_array(data)) {
      if (data != null && data.error != null) {
        throw Error(`synctable_project error - ${data.error}`);
      }
      console.warn("data = ", data);
      throw Error("data must be an array");
    }
    for (let new_val of data) {
      synctable.synthetic_change({new_val}, true);
    }
    if (first_data) {
      synctable.emit("project-ready");
      first_data = false;
    }
  });
  synctable.on("saved-objects", function(saved_objs) {
    //console.log("send: ", query, "channel=", channel.channel, "saved_objs=", saved_objs);
    channel.write(saved_objs);
  });

  await once(synctable, "project-ready");
  synctable.once('closed', function() {
    channel.end();
  });
  return synctable;
}
