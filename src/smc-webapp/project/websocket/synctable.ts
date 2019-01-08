/*
Synctable that uses the project websocket rather than the database.
*/

import { synctable_no_database, SyncTable } from "smc-util/sync/table";

import { once, retry_until_success } from "smc-util/async-utils";

export async function synctable_project(
  project_id,
  query,
  options,
  client,
  throttle_changes?: undefined | number
): Promise<SyncTable> {
  // console.log("synctable_project options", options);
  function log(..._args): void {
    //console.log("synctable", query, ..._args);
  }

  log("touch project...");
  // This mainly makes sure that some hub is connected to
  // the project, so the project can do DB queries.
  await retry_until_success({
    max_delay: 5000,
    f: () => client.touch_project({ project_id })
  });

  let channel: any;

  log("Now create the synctable...");
  const synctable: SyncTable = synctable_no_database(
    query,
    options,
    client,
    throttle_changes,
    []
  );

  let connected: boolean = false;
  function set_connected(state: boolean): void {
    connected = state;
    if (synctable != null) {
      synctable.client.set_connected(state);
    }
  }
  set_connected(false);

  function handle_mesg_from_project(mesg): void {
    log("handle_mesg_from_project: ", mesg);
    if (synctable.get_state() == "closed") return;
    if (mesg == null) {
      throw Error("mesg must not be null");
    }
    if (mesg.init != null) {
      synctable.init_browser_client(mesg.init);
      synctable.emit("init_browser_client");
    }
    if (mesg.versioned_changes != null) {
      synctable.apply_changes_to_browser_client(mesg.versioned_changes);
    }
  }

  function send_mesg_to_project(mesg): void {
    if (!connected) {
      throw Error("cannot write to channel when it is not connected");
    }
    log("send_mesg_to_project", mesg);
    channel.write(mesg);
  }

  async function init_channel(): Promise<void> {
    if (channel != null) {
      end_channel();
    }
    log("init_channel", "get api");
    const api = (await client.project_websocket(project_id)).api;
    log("init_channel", "get channel");
    channel = await api.synctable_channel(query, options);
    set_connected(true);

    log("init_channel", "setup handlers");
    channel.on("data", handle_mesg_from_project);

    // Channel close/open happens on brief network interruptions.
    channel.on("close", function() {
      log("close");
      set_connected(false);
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

  synctable.on("timed-changes", function(timed_changes) {
    send_mesg_to_project({ timed_changes });
  });

  synctable.once("closed", function() {
    end_channel();
  });

  log("Initialize the channel...");
  await init_channel();

  // This data will initialize the synctable.
  log("Wait for initial data");
  await once(synctable, "init_browser_client");

  return synctable;
}
