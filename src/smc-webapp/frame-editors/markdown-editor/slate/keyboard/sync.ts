/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "./register";

register(
  [
    { key: "Enter", alt: true },
    { key: "Enter", meta: true },
  ],
  ({ editor }) => {
    editor.inverseSearch(true);
    return true;
  }
);
