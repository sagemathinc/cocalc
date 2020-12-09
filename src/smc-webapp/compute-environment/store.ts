/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, Store } from "../app-framework";
import { NAME } from "./utils";

class ComputeEnvironmentStore extends Store {
  getInitialState() {
    return {
      inventory: undefined,
      components: undefined,
      langs: undefined,
      // Default selected_lang to 'executables' this since it is MUCH shorter than the others,
      // is the first tab (so faster to render!), and makes no assumptions about if the user
      // is a "Python person" or "R person" or whatever:
      selected_lang: "executables",
      loading: false,
    };
  }
}

redux.createStore(NAME, ComputeEnvironmentStore);
