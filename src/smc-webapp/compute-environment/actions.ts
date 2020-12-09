/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromJS } from "immutable";
import { redux, Actions } from "../app-framework";
import { by_lowercase } from "./utils";
import { ComputeEnvironmentState } from "./types";

export class ComputeEnvironmentActions extends Actions<
  ComputeEnvironmentState
> {
  private init_data(inventory, components): void {
    // both are empty objects by default
    const langs: string[] = [];
    for (let k in inventory) {
      if (k !== "language_exes") {
        langs.push(k);
      }
    }
    langs.sort(by_lowercase);
    this.setState({
      langs: fromJS(langs),
      inventory,
      components,
    });
  }

  public load(): void {
    if (redux.getStore("compute-environment")?.get("loading")) {
      return;
    }
    this.setState({ loading: true });
    // these files only contain "{}" by default, but get set to something interesting
    // in some cases -- see webapp-lib/README.md.

    // @ts-ignore -- for some reason typescript doesn't know about require.ensure, though it does work fine.
    require.ensure([], () => {
      const inventory = require("webapp-lib/compute-inventory.json");
      const components = require("webapp-lib/compute-components.json");
      this.init_data(inventory, components);
    });
  }
}

redux.createActions("compute-environment", ComputeEnvironmentActions);
