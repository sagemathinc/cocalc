/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Declare CodeMirror plugins we use.

It was ridiculously hard to figure out how to declare this in TypeScript!
*/

import { SetMap } from "../frame-tree/types";

import * as CodeMirror from "codemirror";

declare module "codemirror" {
  interface Editor {
    options: CodeMirror.EditorConfiguration;

    setValueNoJump(value: string, scroll_last?: boolean): void;

    delete_trailing_whitespace(opts?: { omit_lines?: SetMap }): void;

    edit_selection(opts: {
      cmd: string;
      args?: any;
      mode?: string;
      project_id?: string;
      cb?: Function; // called after done; if there is a dialog, this could be a while.
    }): void;
  }
}
