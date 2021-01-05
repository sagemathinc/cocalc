/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
CSV Editor Actions
*/

import { Actions as CodeEditorActions } from "../code-editor/actions";

export class Actions extends CodeEditorActions {
  _init2(): void {
    if (!this.is_public) {
      this._init_syncstring_value();
    }
  }
  print(id: string): void {
    const node = this._get_frame_node(id);
    if (!node) return;

    if (node.get("type") === "cm") {
      super.print(id);
      return;
    }
  }
}
