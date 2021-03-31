/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "./register";

register(
  [
    { key: "f", ctrl: true },
    { key: "f", meta: true },
  ],
  ({ extra }) => {
    extra.search.focus(getSelection()?.toString());
    return true;
  }
);

register(
  [
    { key: "g", ctrl: true },
    { key: "g", meta: true },
  ],
  ({ extra }) => {
    extra.search.next();
    return true;
  }
);

register(
  [
    { key: "g", ctrl: true, shift: true },
    { key: "g", meta: true, shift: true },
  ],
  ({ extra }) => {
    extra.search.previous();
    return true;
  }
);
