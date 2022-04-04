/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { register } from "./register";
import { endswith } from "@cocalc/util/misc";

function handleOpen({ token, state }) {
  if (!endswith(token.type, "_open")) return;
  // Opening for new array of children.  We start collecting them
  // until hitting a token with close_type (taking into acocunt nesting).
  state.contents = [];
  const i = token.type.lastIndexOf("_open");
  state.close_type = token.type.slice(0, i) + "_close";
  state.open_type = token.type;
  state.nesting = 0;
  state.attrs = token.attrs;
  state.block = token.block;
  state.open_token = token;
  return [];
}

register(handleOpen);
