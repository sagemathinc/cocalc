/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sage Worksheet Editor Actions
*/
import {
  TextEditorActions as Actions,
  CodeEditorState,
} from "../base-editor/actions-text";
import { FrameTree } from "../frame-tree/types";
import { Store } from "../../app-framework";
import sagewsToIpynb, { sagewsToMarkdown } from "./sagews-to-ipynb";
import { redux } from "@cocalc/frontend/app-framework";

interface SageWorksheetEditorState extends CodeEditorState {}

export class SageWorksheetActions extends Actions<SageWorksheetEditorState> {
  public store: Store<SageWorksheetEditorState>;

  _raw_default_frame_tree(): FrameTree {
    return { type: "convert" };
  }

  toMarkdown = () => {
    return sagewsToMarkdown(this._syncstring.to_str());
  };

  convertToIpynb = async () => {
    const path = this.path.slice(0, -"sagews".length) + "ipynb";
    const ipynb = sagewsToIpynb(this._syncstring.to_str());
    const fs = this.fs();
    await fs.writeFile(path, JSON.stringify(ipynb, undefined, 2));
    redux.getProjectActions(this.project_id).open_file({ path });
  };

  convertToMarkdown = async () => {
    const path = this.path.slice(0, -"sagews".length) + "md";
    const md = sagewsToMarkdown(this._syncstring.to_str());
    const fs = this.fs();
    await fs.writeFile(path, md);
    redux.getProjectActions(this.project_id).open_file({ path });
  };
}

export { SageWorksheetActions as Actions };
