/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as LRU from "lru-cache";
import { fromJS } from "immutable";
import { webapp_client } from "../webapp-client";
import { Store, redux } from "../app-framework";
import { UsersState } from "./types";
import { actions } from "./actions";
import { cmp } from "smc-util/misc";

export const DEFAULT_COLOR = "rgb(170,170,170)";

interface Profile {
  color?: string;
  image?: string;
}
// To avoid overfetching profiles we cache them for a few minutes:
const profiles = new LRU({ maxAge: 1000 * 120 });

// Define user store: all the users you collaborate with
class UsersStore extends Store<UsersState> {
  public get_first_name(account_id: string): string {
    return this.getIn(["user_map", account_id, "first_name"], "Unknown");
  }

  public get_last_name(account_id: string): string {
    return this.getIn(["user_map", account_id, "last_name"], "User");
  }

  // get_color and get_image below: for collaborators the image may
  // immediately be known; for non-collabs
  // it gets looked up via a database query (if not cached):

  public get_color_sync(account_id: string): string {
    return this.getIn(["user_map", account_id, "color"]) ?? DEFAULT_COLOR;
  }

  // URL of color (defaults to DEFAULT_COLOR)
  public async get_color(account_id: string): Promise<string> {
    const user = this.getIn(["user_map", account_id]);
    if (user != null) {
      // known collaborator so easy - already loaded as part of the users table.
      return user.getIn(["profile", "color"]) ?? DEFAULT_COLOR;
    }
    await this.get_image(account_id); // ensures profile is known and cached
    return ((profiles.get(account_id) as Profile | undefined)?.color ??
      DEFAULT_COLOR) as string;
  }

  // URL of image or undefined if there is no image set
  public async get_image(account_id: string): Promise<string | undefined> {
    const user = this.getIn(["user_map", account_id]);
    if (user != null) {
      // known collaborator so easy - already loaded as part of the users table.
      return user.getIn(["profile", "image"]);
    }
    // Not known collaborator, so do a database query... unless we already did
    // one for this account recently.
    if (profiles.has(account_id)) {
      return (profiles.get(account_id) as Profile | undefined)?.image as
        | string
        | undefined;
    }
    // Do database query
    const x = (
      await webapp_client.async_query({
        query: { account_profiles: { account_id, profile: null } },
      })
    ).query.account_profiles;
    profiles.set(account_id, x?.profile);
    return x?.profile?.image;
  }

  public get_name(account_id): string | undefined {
    const user_map = this.get("user_map");
    if (user_map == null) {
      return;
    }
    const m = user_map.get(account_id);
    if (m != null) {
      return `${m.get("first_name")} ${m.get("last_name")}`;
    } else {
      // look it up, which causes it to get saved in the store, which causes a new render later.
      actions.fetch_non_collaborator(account_id);
      // for now will just return undefined; when store gets updated with other_names
      // knowing the account_id, then component will re-reender.
      return;
    }
  }

  public get_last_active(account_id) {
    return this.getIn(["user_map", account_id, "last_active"]);
  }

  // Given an array of objects with an account_id field, sort it by the
  // corresponding last_active timestamp, starting with most recently active.
  // Also, adds the last_active field to each element of users, if it isn't
  // already there.
  public sort_by_activity(users) {
    for (let user of users) {
      // If last_active isn't set, set it to what's in the store... unless
      // the store doesn't know, in which case set to 0 (infinitely old):
      if (user.last_active == null) {
        var left;
        user.last_active =
          (left = this.get_last_active(user.account_id)) != null ? left : 0;
      }
    }
    return users.sort((a, b) => {
      const c = cmp(b.last_active, a.last_active);
      if (c) {
        return c;
      } else {
        return cmp(
          this.get_last_name(a.account_id),
          this.get_last_name(b.account_id)
        );
      }
    });
  }
}

// Register user store
export const store = redux.createStore("users", UsersStore, {
  user_map: fromJS({}),
});
