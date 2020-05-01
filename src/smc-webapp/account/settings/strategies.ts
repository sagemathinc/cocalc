declare var $;
import { fromJS } from "immutable";
import { redux } from "../../app-framework";

export const STRATEGIES: string[] = ["email"];

function load_strategies_from_server(): void {
  $.get(`${window.app_base_url}/auth/strategies`, function (
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
       * Type the following in the javascript console to make all strategy
       * buttons appear, purely for UI testing:
       *  cc.redux.getActions('account').setState({strategies:["email","facebook","github","google","twitter"]})
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
