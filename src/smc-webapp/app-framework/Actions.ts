/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AppRedux } from "../app-framework";
import { bind_methods } from "smc-util/misc";

// NOTE: it is intentional that there is no get method.  Instead, get data
// from stores.  The table will set stores (via creating actions) as
// needed when it changes.
export class Actions<T> {
  constructor(public name: string, protected redux: AppRedux) {
    bind_methods(this); // see comment in Store.ts.
    if (this.name == null) {
      throw Error("name must be defined");
    }
    if (this.redux == null) {
      throw Error("redux must be defined");
    }
  }

  setState = (obj: Partial<{ [P in keyof T]: T[P] }>): void => {
    // This ? is because sometimes setState is called after the actions
    // are cleaned up (so this.redux is null) and closed for an editor,
    // and crashing isn't useful, but silently ignoring is in this case.
    // See https://github.com/sagemathinc/cocalc/issues/5263 for an
    // example in nature.
    if (this.redux?.getStore(this.name) == null) {
      return; // No op
    }
    this.redux._set_state({ [this.name]: obj }, this.name);
  };

  destroy = (): void => {
    // On the share server this.redux can be undefined at this point.
    this.redux?.removeActions(this.name);
  };
}
