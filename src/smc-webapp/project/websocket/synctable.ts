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
  let initial_get_query: any[] = [];

  function log(...args): void {
    if ((channel as any).verbose) {
      console.log(...args);
    }
  }

  let channel: any;
  let synctable: undefined | SyncTable = undefined;
  function handle_data(data) {
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
  }

  async function init_channel() {
    channel = await api.synctable_channel(query, options);
    if (synctable != undefined) {
      (synctable as any).channel = channel; // for dev only
    }
    channel.on("data", handle_data);

    // Channel close/open happens on brief network interruptions.  However,
    // the messages are queued up, so that's fine and no special action is needed.
    channel.on("close", function() {
      console.log("close -- TODO!");
    });

    channel.on("open", function() {
      channel.removeAllListeners();
      channel.end();
      init_channel();
    });
  }

  await init_channel();

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
    channel.removeAllListeners();
    try {
      channel.end();
    } catch {
      // closing a project with open files closes the whole websocket *and*
      // the channels at the same time, which causes an exception.
    }
  });

  await once(synctable, "connected");

  return synctable;
}
