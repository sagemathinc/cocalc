/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Declare CodeMirror plugins we use.

It was ridiculously hard to figure out how to declare this in TypeScript!
*/

import { SetMap } from "../frame-tree/types";

import * as CodeMirror from "codemirror";

CodeMirror; // just to make typescript happy that CodeMirror is used.  The import above *is* needed.

declare module "codemirror" {
  interface Editor {
    options: EditorConfiguration;

    setValueNoJump(value: string, scroll_last?: boolean): void;

    delete_trailing_whitespace(opts?: { omit_lines?: SetMap }): void;

    edit_selection(opts: {
      cmd: string;
      args?: any;
      mode?: string;
      cb?: Function; // called after done; if there is a dialog, this could be a while.
    }): void;

    insertCompletion(item: string): void;
  }
}

CodeMirror.defineExtension("insertCompletion", function (item: string): void {
  const cm = this;
  const cursor = cm.getCursor();
  console.log("insertCompletion", cursor, item);
});
