import { Table, redux } from "../app-framework";
import { store } from "./store";
import { actions } from "./actions";
import { COCALC_MINIMAL } from "../fullscreen";

// Create and register projects table, which gets automatically
// synchronized with the server.
class UsersTable extends Table {
  query() {
    const kiosk_project_id = redux.getStore("page").get("kiosk_project_id");
    if (kiosk_project_id) {
      // In kiosk mode for a project we load only collabs on the relevant project.
      const query = require("smc-util/sync/table/util").parse_query(
        "collaborators_one_project"
      );
      query.collaborators_one_project[0].project_id = kiosk_project_id;
      return query;
    } else {
      return "collaborators";
    }
  }

  no_changefeed() {
    // The current collaborators_one_project does NOT support changefeeds, so we only get
    // the users and names in kiosk mode once during the first connection.
    return redux.getStore("page").get("kiosk_project_id") != null;
  }

  _change(table, _keys) {
    // Merge the new table in with what we already have.  If users disappear during the session
    // *or* if user info is added by fetch_non_collaborator, it is important not to just
    // forget about their names.
    const upstream_user_map = table.get();
    let user_map = store.get("user_map");
    if (user_map == null) {
      return actions.setState({ user_map: upstream_user_map });
    } else {
      // merge in upstream changes:
      table.get().map((data, account_id) => {
        if (data !== user_map.get(account_id)) {
          user_map = user_map.set(account_id, data);
        }
        return false;
      });
      actions.setState({ user_map });
    }
  }
}

// we create the table either if we're in normal (not kiosk) mode,
// or when we have a specific project_id for kiosk mode
if (!COCALC_MINIMAL || redux.getStore("page").get("kiosk_project_id") != null) {
  redux.createTable("users", UsersTable);
}

// this is only for kiosk mode
export function recreate_users_table(): void {
  //console.log("recreate_users_table: project_id =", redux.getStore('page').get('kiosk_project_id'))
  redux.removeTable("users");
  redux.createTable("users", UsersTable);
}
