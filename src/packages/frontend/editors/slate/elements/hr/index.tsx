/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { register, SlateElement } from "../register";

export interface HR extends SlateElement {
  type: "hr";
}

register({
  slateType: "hr",

  toSlate: ({ children }) => {
    return { type: "hr", isVoid: true, children };
  },

  StaticElement: ({ attributes }) => {
    // The borderTop on the hr is just "fighting back" against a dumb thing
    // that is imposed by bootstrap3... (it's in scaffolding.less).  Someday
    // we'll get rid of bootstrap css entirely!
    return <hr {...attributes} style={{ borderTop: "1px solid #aaa" }} />;
  },
});
