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
  const api = (await client.project_websocket(project_id)).api;
  const channel = await api.synctable_channel(query, options);
  let initial_get_query: any[] = [];

  function log(...args): void {
    if ((channel as any).verbose) {
      console.log(...args);
    }
  }

  let synctable: undefined | SyncTable = undefined;

  channel.on("data", function(data) {
    /* Allowed messages:
        {new_val?: [...], old_val?:[...]}
      Nothing else yet.

      TODO: old_val would be used for deleting, but sending deletes is not implemented YET.
    */
    log("recv: ", query, "channel=", channel.channel, "data=", data);
    if (synctable === undefined) {
      if (data == null || !is_array(data.new_val)) {
        throw Error("first data must be {new_val:[...]}");
      }
      initial_get_query = data.new_val;
    } else {
      synctable.synthetic_change(data);
    }
  });

  // Wait for initial data, which will initialize the initial_get_query array.
  await once(channel, "data");

  // Now create the synctable -- note here we pass in the initial_get_query:
  synctable = synctable_no_database(
    query,
    options,
    client,
    throttle_changes,
    initial_get_query
  );

  (synctable as any).channel = channel; // for dev only

  synctable.on("saved-objects", function(saved_objs) {
    log(
      "send: ",
      query,
      "channel=",
      channel.channel,
      "saved_objs=",
      saved_objs
    );
    channel.write(saved_objs);
  });

  synctable.once("closed", function() {
    channel.end();
  });

  channel.on("close", function() {
    log("channel.close");
    synctable.disconnect();
  });

  await once(synctable, "connected");

  return synctable;
}
