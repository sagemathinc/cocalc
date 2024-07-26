/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// 3rd Party Libraries
import * as immutable from "immutable";

// Internal Libraries
import { Store } from "@cocalc/util/redux/Store";

export interface MarkdownWidgetStoreState {
  open_inputs: immutable.Map<any, any>;
}

export class MarkdownWidgetStore extends Store<MarkdownWidgetStoreState> {
  getInitialState = function () {
    return {
      open_inputs: immutable.Map({}),
    };
  };
}
