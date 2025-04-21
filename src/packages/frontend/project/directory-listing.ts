/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { server_time } from "@cocalc/util/misc";
import { once, retry_until_success } from "@cocalc/util/async-utils";
import { webapp_client } from "../webapp-client";
import { redux } from "../app-framework";
import { dirname } from "path";

//const log = (...args) => console.log("directory-listing", ...args);
const log = (..._args) => {};

interface ListingOpts {
  project_id: string;
  path: string;
  hidden: boolean;
  max_time_s: number;
  group: string;
  trigger_start_project?: boolean;
  compute_server_id: number;
}

// This makes an api call directly to the project to get a directory listing.

export async function get_directory_listing(opts: ListingOpts) {
  log("get_directory_listing", opts);

  let method, state, time0, timeout;

  if (["owner", "collaborator", "admin"].indexOf(opts.group) != -1) {
    method = webapp_client.project_client.directory_listing;
    // Also, make sure project starts running, in case it isn't.
    state = (redux.getStore("projects") as any).getIn([
      "project_map",
      opts.project_id,
      "state",
      "state",
    ]);
    if (state != null && state !== "running") {
      timeout = 0.5;
      time0 = server_time();
      if (opts.trigger_start_project === false) {
        return { files: [] };
      }
      redux.getActions("projects").start_project(opts.project_id);
    } else {
      timeout = 1;
    }
  } else {
    throw Error("you do not have access to this project");
  }

  let listing_err: Error | undefined;
  method = method.bind(webapp_client.project_client);
  async function f(): Promise<any> {
    try {
      return await method({
        project_id: opts.project_id,
        path: opts.path,
        hidden: opts.hidden,
        compute_server_id: opts.compute_server_id,
        timeout,
      });
    } catch (err) {
      if (err.message != null) {
        if (err.message.indexOf("ENOENT") != -1) {
          listing_err = Error("no_dir");
          return;
        } else if (err.message.indexOf("ENOTDIR") != -1) {
          listing_err = Error("not_a_dir");
          return;
        }
      }
      if (timeout < 5) {
        timeout *= 1.3;
      }
      throw err;
    }
  }

  let listing;
  try {
    listing = await retry_until_success({
      f,
      max_time: opts.max_time_s * 1000,
      start_delay: 100,
      max_delay: 1000,
    });
  } catch (err) {
    listing_err = err;
  } finally {
    // no error, but `listing` has no value, too
    // https://github.com/sagemathinc/cocalc/issues/3223
    if (!listing_err && listing == null) {
      listing_err = Error("no_dir");
    }
    if (time0 && state !== "running" && !listing_err) {
      // successfully opened, started, and got directory listing
      redux.getProjectActions(opts.project_id).log({
        event: "start_project",
        time: server_time().valueOf() - time0.valueOf(),
      });
    }

    if (listing_err) {
      throw listing_err;
    } else {
      return listing;
    }
  }
}

import { Listings } from "@cocalc/frontend/nats/listings";

export async function get_directory_listing2(opts: ListingOpts): Promise<any> {
  log("get_directory_listing2", opts);
  const start = Date.now();
  const store = redux.getProjectStore(opts.project_id);
  const compute_server_id =
    opts.compute_server_id ?? store.get("compute_server_id");
  const listings: Listings = await store.get_listings(compute_server_id);
  listings.watch(opts.path);
  if (opts.path) {
    listings.watch(dirname(opts.path));
  }
  while (Date.now() - start < opts.max_time_s * 1000) {
    if (listings.getMissing(opts.path)) {
      if (
        store.getIn(["directory_listings", compute_server_id, opts.path]) !=
        null
      ) {
        // just update an already loaded listing:
        try {
          const files = await listings.getListingDirectly(
            opts.path,
            opts.trigger_start_project,
          );
          return { files };
        } catch (err) {
          console.log(
            `WARNING: temporary problem getting directory listing -- ${err}`,
          );
        }
      } else {
        // ensure all listing entries get loaded soon.
        redux
          .getProjectActions(opts.project_id)
          ?.fetch_directory_listing_directly(
            opts.path,
            opts.trigger_start_project,
            compute_server_id,
          );
      }
    }
    // return what we have now, if anything.
    const files = await listings.get(opts.path, opts.trigger_start_project);
    if (files != null) {
      return { files };
    }
    await once(
      listings,
      "change",
      opts.max_time_s * 1000 - (Date.now() - start),
    );
  }
}
