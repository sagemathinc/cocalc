/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare var $;
import { fromJS } from "immutable";
import { redux } from "../../app-framework";
import { PassportStrategy } from "../passport-types";

export const STRATEGIES: PassportStrategy[] = [{ name: "email" }];

function load_strategies_from_server(): void {
  $.get(`${window.app_base_url}/auth/strategies?v=2`, function (
    strategies,
    status
  ) {
    if (status === "success") {
      // We modify STRATEGIES in place to equal strategies, because
      // something has a reference to STRATEGIES already.
      for (const strategy of strategies) {
        if (!STRATEGIES.includes(strategy)) {
          STRATEGIES.push(strategy);
        }
      }
      for (const strategy of STRATEGIES) {
        if (!strategies.includes(strategy)) {
          STRATEGIES.splice(STRATEGIES.indexOf(strategy), 1);
        }
      }

      /*
       * Type the following in the javascript console to make more strategy buttons appear, purely for UI testing:
       *  cc.redux.getActions('account').setState({strategies:[{"name":"email"},{"name":"google"},{"name":"facebook"},{"name":"github"},{"name":"twitter"},{"name":"ldap","display":"LDAP","type":"ldap","icon":"https://img.icons8.com/ios-filled/72/active-directory.png"},{"name":"oauth2","display":"OAuth2","type":"oauth2","icon":"https://cdn.auth0.com/blog/illustrations/oauth-2.png"}]})
       */

      // OPTIMIZATION: this forces re-render of the strategy part of the component above!
      // It should directly depend on the store, but instead right now still
      // depends on STRATEGIES.
      redux.getActions("account").setState({ strategies: fromJS(STRATEGIES) });
    } else {
      // Failed (network error?) so try again in a minute.
      return setTimeout(load_strategies_from_server, 60000);
    }
  });
}

// try
load_strategies_from_server();
