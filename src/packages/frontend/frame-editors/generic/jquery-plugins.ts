/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import "jquery";

declare global {
  interface JQuery {
    make_height_defined(): JQuery;
  }
}
