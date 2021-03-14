/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node } from "slate";

// The version of isNodeList in slate is **insanely** slow, and this hack
// is likely to be sufficient for our use.
// This makes a MASSIVE different for larger documents!
Node.isNodeList = (value: any): value is Node[] => {
  return Array.isArray(value) && (value?.length == 0 || Node.isNode(value[0]));
};
