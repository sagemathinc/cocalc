import { React, Component, redux, rclass, rtypes } from "../app-framework";
import { Button } from "antd";

import { AccountCreationToken } from "./account-creation-token";
import { SiteSettings } from "./site-settings";
import { StripeAPIKeys } from "./stripe-api-keys";
//import { SubscriptionManager } from "./subscription-manager";
import { SystemNotifications } from "./system-notifications";
import { UserSearch } from "./users/user-search";
import { ABTestResults, log } from "./ab-test";
import { List } from "immutable";

import { User } from "./store";

interface ReduxProps {
  user_search_state: "edit" | "running";
  user_search_status: string;
  user_search_query: string;
  user_search_result: List<User>;
  ab_test_name: string;
  ab_test_results: Map<string, any>;
}

require("./init").init(redux);
const admin_actions = redux.getActions("admin-page");

export const AdminPage = rclass(
  class AdminPage extends Component<ReduxProps> {
    static reduxProps() {
      return {
        "admin-page": {
          user_search_state: rtypes.string,
          user_search_status: rtypes.string,
          user_search_query: rtypes.string,
          user_search_result: rtypes.immutable.List,
          ab_test_name: rtypes.string,
          ab_test_results: rtypes.immutable.Map
        }
      };
    }

    render() {
      return (
        <div
          style={{
            overflowY: "scroll",
            overflowX: "hidden",
            margin: "0px 45px"
          }}
        >
          <h3>Administration</h3>
          <hr />
          <UserSearch
            state={this.props.user_search_state}
            status={this.props.user_search_status}
            query={this.props.user_search_query}
            result={this.props.user_search_result}
            search={admin_actions.fetch_for_user_search}
            set_query={admin_actions.set_user_search_query}
            clear_status={admin_actions.clear_user_search_status}
          />
          <hr />
          <Button
            onClick={() => log(redux.getStore("account").get("account_id"))}
          >
            Make a ab test log. Clicking the next button should fetch the
            result.
          </Button>
          <Button onClick={() => admin_actions.fetch_ab_test()}>
            Fetch AB Test Placeholder
          </Button>
          <ABTestResults ab_test_entries={this.props.ab_test_results} />
          <hr />
          <SiteSettings />
          <hr />
          <SystemNotifications />
          <hr />
          <StripeAPIKeys />
          <hr />
          <AccountCreationToken />
        </div>
      );
    }
  }
);
