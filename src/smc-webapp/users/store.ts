import { Store, redux } from "../app-framework";
import { UsersState } from "./types";
import { actions } from "./actions";
import { cmp } from "smc-util/misc";
import { fromJS } from "immutable";

// Define user store: all the users you collaborate with
class UsersStore extends Store<UsersState> {
  public get_first_name(account_id): string {
    return this.getIn(["user_map", account_id, "first_name"], "Unknown");
  }

  public get_last_name(account_id): string {
    return this.getIn(["user_map", account_id, "last_name"], "User");
  }

  // URL of color (defaults to rgb(170,170,170))
  public get_color(account_id): string {
    return this.getIn(
      ["user_map", account_id, "profile", "color"],
      "rgb(170,170,170)"
    );
  }

  // URL of image or undefined if none
  public get_image(account_id): string | undefined {
    return this.getIn(["user_map", account_id, "profile", "image"]);
  }

  public get_name(account_id) : string | undefined {
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
    return users.sort(function(a, b) {
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
  user_map: fromJS({})
});
