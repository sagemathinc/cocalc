/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { JupyterStore } from "../store";

export class NBGraderStore {
  private store: JupyterStore;
  constructor(store: JupyterStore) {
    this.store = store;
  }

  public autograder_tests_info(): { count: number } {
    console.log(this.store);
    return { count: 1 };
  }
}
