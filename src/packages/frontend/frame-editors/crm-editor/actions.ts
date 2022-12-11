/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
CRM Editor Actions
*/

import { Actions as CodeEditorActions } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";

export class Actions extends CodeEditorActions {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["table"];
  protected string_cols: string[] = [];

  _init2(): void {}

  _raw_default_frame_tree(): FrameTree {
    return {
      direction: "col",
      type: "node",
      first: {
        type: "people",
      },
      second: {
        type: "accounts",
      },
    };
  }
}
