/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, Store } from "../app-framework";

import { NAME } from "./store";

class ComputeEnvironmentActions extends Actions {
  get(key) {
    return this.redux.getStore(this.name).get(key);
  }

  init_data(inventory, components) {
    // both are empty objects by default
    const langs = (() => {
      const result = [];
      for (let k in inventory) {
        const v = inventory[k];
        if (k !== "language_exes") {
          result.push(k);
        }
      }
      return result;
    })();
    langs.sort(by_lowercase);
    return this.setState({
      langs,
      inventory,
      components,
    });
  }
  //if DEBUG then console.log(inventory, components, langs)

  load() {
    if (this.get("loading")) {
      return;
    }
    this.setState({ loading: true });
    //if DEBUG then console.log("ComputeEnvironmentActions: loading ...")
    return require.ensure([], () => {
      // these files only contain "{}" per default!
      const inventory = require("webapp-lib/compute-inventory.json");
      const components = require("webapp-lib/compute-components.json");
      return this.init_data(inventory, components);
    });
  }
}
//if DEBUG then console.log("ComputeEnvironmentActions: loading done.")
