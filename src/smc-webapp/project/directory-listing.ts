/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { server_time } from "smc-util/misc";
import { once, retry_until_success } from "smc-util/async-utils";
import { webapp_client } from "../webapp-client";
import { redux } from "../app-framework";
import * as prom_client from "../prom-client";

let prom_get_dir_listing_h;
if (prom_client.enabled) {
  prom_get_dir_listing_h = prom_client.new_histogram(
    "get_dir_listing_seconds",
    "get_directory_listing time",
    {
      buckets: [1, 2, 5, 7, 10, 15, 20, 30, 50],
      labels: ["public", "state", "err"],
    }
  );
}

interface ListingOpts {
  project_id: string;
  path: string;
  hidden: boolean;
  max_time_s: number;
  group: string;
}

export async function get_directory_listing(opts: ListingOpts): Promise<any> {
  let prom_dir_listing_start, prom_labels;
  if (prom_client.enabled) {
    prom_dir_listing_start = server_time();
    prom_labels = { public: false };
  }

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
    if (prom_client.enabled) {
      prom_labels.state = state;
    }
    if (state != null && state !== "running") {
      timeout = 0.5;
      time0 = server_time();
      redux.getActions("projects").start_project(opts.project_id);
    } else {
      timeout = 1;
    }
  } else {
    state = time0 = undefined;
    method = webapp_client.project_client.public_directory_listing;
    timeout = 15;
    if (prom_client.enabled) {
      prom_labels.public = true;
    }
  }

  let listing_err: Error | undefined;
  method = method.bind(webapp_client.project_client);
  async function f(): Promise<any> {
    try {
      return await method({
        project_id: opts.project_id,
        path: opts.path,
        hidden: opts.hidden,
        timeout,
      });
    } catch (err) {
      if (err.message != null) {
        if (err.message.indexOf("ENOENT") != -1) {
          listing_err = Error("no_dir");
        } else if (err.message.indexOf("ENOTDIR") != -1) {
          listing_err = Error("not_a_dir");
        } else {
          listing_err = err.message;
        }
        return undefined;
      } else {
        if (timeout < 5) {
          timeout *= 1.3;
        }
        throw err;
      }
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
    if (prom_client.enabled && prom_dir_listing_start != null) {
      prom_labels.err = !!listing_err;
      const tm =
        (server_time().valueOf() - prom_dir_listing_start.valueOf()) / 1000;
      if (!isNaN(tm)) {
        if (prom_get_dir_listing_h != null) {
          prom_get_dir_listing_h.observe(prom_labels, tm);
        }
      }
    }

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

import { Listings } from "./websocket/listings";

export async function get_directory_listing2(opts: ListingOpts): Promise<any> {
  const store = redux.getProjectStore(opts.project_id);
  const listings: Listings = await store.get_listings();
  listings.watch(opts.path);
  while (true) {
    if (listings.get_missing(opts.path)) {
      if (store.getIn(["directory_listings", opts.path]) != null) {
        // just update an already loading listing:
        try {
          return await listings.get_listing_directly(opts.path);
        } catch (err) {
          console.warn(
            `WARNING: problem getting directory listing ${err}; falling back`
          );
        }
      } else {
        // ensure all listing entries get loaded soon.
        redux
          .getProjectActions(opts.project_id)
          ?.fetch_directory_listing_directly(opts.path);
      }
    }
    // return what we have now:
    const files = await listings.get(opts.path);
    if (files != null) {
      return files;
    }
    await once(listings, "change");
  }
}
