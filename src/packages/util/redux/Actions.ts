/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { AppRedux } from "./types";
import { bind_methods } from "@cocalc/util/misc";

// NOTE: it is intentional that there is no get method.  Instead, get data
// from stores.  The table will set stores (via creating actions) as
// needed when it changes.
export class Actions<T> {
  constructor(
    readonly name: string,
    readonly redux: AppRedux,
  ) {
    bind_methods(this); // see comment in Store.ts.
    if (this.name == null) {
      throw Error("name must be defined");
    }
    if (this.redux == null) {
      throw Error("redux must be defined");
    }
  }

  setState = (obj: Partial<{ [P in keyof T]: T[P] }>): void => {
    if (this.redux == null) {
      // Sometimes setState is called after the actions
      // are cleaned up (so this.redux is null) and closed for an editor,
      // and crashing isn't useful, but silently ignoring is in this case.
      // See https://github.com/sagemathinc/cocalc/issues/5263 for an
      // example in nature.
      return;
    }
    if (this.redux.getStore(this.name) == null) {
      return; // No op
    }
    this.redux._set_state({ [this.name]: obj }, this.name);
  };

  destroy = (): void => {
    if (this.name == null) {
      throw Error("unable to destroy actions because this.name is not defined");
    }
    if (this.redux == null) {
      throw Error(
        `unable to destroy actions '${this.name}' since this.redux is not defined`,
      );
    }
    // On the share server this.redux can be undefined at this point.
    this.redux.removeActions(this.name);
  };
}
