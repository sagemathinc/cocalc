/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sage Worksheet Editor Actions
*/
import { Actions, CodeEditorState } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { Store } from "../../app-framework";

interface SageWorksheetEditorState extends CodeEditorState {}

export class SageWorksheetActions extends Actions<SageWorksheetEditorState> {
  public store: Store<SageWorksheetEditorState>;

  _init2(): void {
    this._syncstring.on("change", (keys) => {
      console.log("change", keys);
    });
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "convert" };
  }
}

export { SageWorksheetActions as Actions };
