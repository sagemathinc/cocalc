/*
Synctable that uses the project websocket rather than the database.
*/

import { synctable_no_database, SyncTable } from "smc-util/sync/table";

const { is_array } = require("smc-util/misc");

import { once, retry_until_success } from "smc-util/async-utils";

interface Data {
  new_val?: any[];
  old_val?: any[];
}

export async function synctable_project(
  project_id,
  query,
  options,
  client,
  throttle_changes?: undefined | number
): Promise<SyncTable> {
  // console.log("synctable_project options", options);
  function log(..._args): void {
    console.log("synctable", query, ..._args);
  }

  log("touch project...");
  // This mainly makes sure that some hub is connected to
  // the project, so the project can do DB queries.
  await retry_until_success({
    max_delay: 5000,
    f: () => client.touch_project({ project_id })
  });

  let initial_get_query: any[] = [];

  let channel: any;
  let synctable: undefined | SyncTable = undefined;
  const queued_messages: any[] = [];
  let connected: boolean = false;
  const options0: any[] = [];
  let queue_size = Infinity; // "unlimited".

  for (let option of options) {
    if (option != null && option.queue_size != null) {
      queue_size = option.queue_size;
    } else {
      options0.push(option);
    }
  }

  function handle_data(data: Data): void {
    /* Allowed messages:
        {new_val?: [...], old_val?:[...]}
      Nothing else yet.

      TODO: old_val would be used for deleting, but sending deletes is not implemented YET.
    */
    log("recv: ", "data=", data);
    if (synctable === undefined) {
      if (data == null || data.new_val == null || !is_array(data.new_val)) {
        throw Error("first data must be {new_val:[...]}");
      }
      initial_get_query = data.new_val;
    } else {
      if (synctable.get_state() == "closed") {
        return;
      }
      synctable.synthetic_change(data);
    }

    // Write any queued up messages to our channel.
    while (queued_messages.length > 0) {
      const mesg = queued_messages.shift();
      log("sending queued mesg: ", mesg);
      channel.write(mesg);
    }
  }

  function write_to_channel(mesg): void {
    if (connected) {
      channel.write(mesg);
    } else {
      queued_messages.push(mesg);
      while (queued_messages.length > queue_size) {
        queued_messages.shift();
      }
    }
  }

  async function init_channel(): Promise<void> {
    if (channel != null) {
      end_channel();
    }
    log("init_channel", "get api");
    const api = (await client.project_websocket(project_id)).api;
    log("init_channel", "get channel");
    channel = await api.synctable_channel(query, options);
    connected = true;

    log("init_channel", "setup handlers");
    channel.on("data", handle_data);

    // Channel close/open happens on brief network interruptions.  However,
    // the messages are queued up, so that's fine and no special action is needed.
    channel.on("close", function() {
      log("close");
      connected = false;
    });

    channel.on("open", function() {
      log("open");
      init_channel();
    });
  }

  function end_channel(): void {
    if (channel == null) {
      return;
    }
    channel.removeAllListeners();
    try {
      channel.end();
    } catch {
      // closing a project with open files closes the whole websocket *and*
      // the channels at the same time, which causes an exception.
    }
    channel = undefined;
  }

  log("Initialize the channel...");
  await init_channel();

  log("Wait for initial data...")
  // This data will initialize the initial_get_query array below.
  await once(channel, "data");

  log("Now create the synctable...");
  synctable = synctable_no_database(
    query,
    options0,
    client,
    throttle_changes,
    initial_get_query // -- note here we pass in the initial_get_query
  );

  synctable.on("saved-objects", function(saved_objs) {
    log("send: ", saved_objs);
    write_to_channel(saved_objs);
  });

  synctable.once("closed", function() {
    end_channel();
  });

  await once(synctable, "connected");

  return synctable;
}
