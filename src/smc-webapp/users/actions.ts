import { Actions, redux } from "../app-framework";
import { fromJS } from "immutable";
import { webapp_client } from "../webapp-client";
import { UsersState } from "./types";
import { store } from "./store";

class UsersActions extends Actions<UsersState> {
  public fetch_non_collaborator(account_id: string): void {
    if (!account_id) {
      return;
    }
    webapp_client.get_username({
      account_id,
      cb: (err, x) => {
        if (err) {
          return console.warn(
            `WARNING: unable to get username for account with id '${account_id}'`
          );
        } else {
          const obj = x[account_id];
          if (typeof obj === "object") {
            // see https://github.com/sagemathinc/cocalc/issues/2828
            obj.account_id = account_id;
            let user_map = store.get("user_map");
            if (user_map != null && user_map.get(account_id) == null) {
              user_map = user_map.set(account_id, fromJS(obj));
              this.setState({ user_map });
            }
          }
        }
      },
    });
  }
}

// Register user actions
export const actions = redux.createActions("users", UsersActions);
