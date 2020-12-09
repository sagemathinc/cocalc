/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, Actions } from "../app-framework";
import { by_lowercase, NAME } from "./utils";

class ComputeEnvironmentActions extends Actions {
  private init_data(inventory, components): void {
    // both are empty objects by default
    const langs: string[] = [];
    for (let k in inventory) {
      const v = inventory[k];
      if (k !== "language_exes") {
        langs.push(k);
      }
    }
    langs.sort(by_lowercase);
    this.setState({
      langs,
      inventory,
      components,
    });
  }

  public load(): void {
    if (redux.getStore(NAME)?.get("loading")) {
      return;
    }
    this.setState({ loading: true });
    //if DEBUG then console.log("ComputeEnvironmentActions: loading ...")
    require.ensure([], () => {
      // these files only contain "{}" per default!
      const inventory = require("webapp-lib/compute-inventory.json");
      const components = require("webapp-lib/compute-components.json");
      this.init_data(inventory, components);
    });
  }
}

redux.createActions(NAME, ComputeEnvironmentActions);
