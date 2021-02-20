/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */


import { withInsertText } from "./insert-text";
import { withDeleteBackward } from "./delete-backward";

export const withAutoFormat = (editor) => {
  withInsertText(editor);
  withDeleteBackward(editor);

  return editor;
};
