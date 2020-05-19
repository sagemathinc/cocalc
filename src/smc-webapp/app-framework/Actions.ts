/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AppRedux } from "../app-framework";

// NOTE: it is intentional that there is no get method.  Instead, get data
// from stores.  The table will set stores (via creating actions) as
// needed when it changes.
export class Actions<T> {
  constructor(public name: string, protected redux: AppRedux) {
    if (this.name == null) {
      throw Error("name must be defined");
    }
    if (this.redux == null) {
      throw Error("redux must be defined");
    }
  }

  setState = (obj: Partial<{ [P in keyof T]: T[P] }>): void => {
    if (this.redux.getStore(this.name) == undefined) {
      return; // No op
    }
    this.redux._set_state({ [this.name]: obj });
  };

  destroy = (): void => {
    this.redux.removeActions(this.name);
  };
}
