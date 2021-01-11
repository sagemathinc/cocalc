/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Markdown Editor Actions
*/

import { toggle_checkbox } from "../../editors/task-editor/desc-rendering";
import * as $ from "jquery";
import {
  Actions as CodeEditorActions,
  CodeEditorState,
} from "../code-editor/actions";
import { print_html } from "../frame-tree/print";
import { FrameTree } from "../frame-tree/types";
import { ReactEditor as SlateEditor } from "slate-react";
import { formatAction as slateFormatAction } from "./slate/format";

interface MarkdownEditorState extends CodeEditorState {
  custom_pdf_error_message: string; // currently used only in rmd editor, but we could easily add pdf output to the markdown editor
  building: boolean; // for Rmd
  build_log: string; // for Rmd
  build_err: string; // for Rmd
  build_exit: number; // for Rmd
}

export class Actions extends CodeEditorActions<MarkdownEditorState> {
  private slateEditors: { [id: string]: SlateEditor } = {};

  _init2(): void {
    if (!this.is_public) {
      this._init_syncstring_value();
      this._init_spellcheck();
    }
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "markdown" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm",
        },
        second: {
          type: "slate",
        },
      };
    }
  }

  toggle_markdown_checkbox(id: string, index: number, checked: boolean): void {
    // Ensure that an editor state is saved into the
    // (TODO: make more generic, since other editors will exist that are not just codemirror...)
    this.set_syncstring_to_codemirror(id);
    // Then do the checkbox toggle.
    const value = toggle_checkbox(this._syncstring.to_str(), index, checked);
    this._syncstring.from_str(value);
    this.set_codemirror_to_syncstring();
    this._syncstring.save();
    this.setState({ value });
  }

  print(id: string): void {
    const node = this._get_frame_node(id);
    if (!node) return;
    if (node.get("type") === "cm") {
      super.print(id);
      return;
    }

    try {
      print_html({
        html: $(`#frame-${id}`).html(),
        project_id: this.project_id,
        path: this.path,
      });
    } catch (err) {
      this.set_error(err);
    }
  }

  // Never delete trailing whitespace for markdown files.
  delete_trailing_whitespace(): void {}

  // per-session sync-aware undo; aware of more than one editor type
  undo(id: string): void {
    if (this._get_frame_type(id) != "slate") {
      super.undo(id);
      return;
    }
    const value = this._syncstring.undo().to_str();
    this._syncstring.set(value, true);
    this._syncstring.commit();
    // Important: also set codemirror editor state, if there is one (otherwise it will be out of sync!)
    this._get_cm()?.setValueNoJump(value, true);
  }

  // per-session sync-aware redo ; aware of more than one editor type
  redo(id: string): void {
    if (this._get_frame_type(id) != "slate") {
      super.redo(id);
      return;
    }
    if (!this._syncstring.in_undo_mode()) {
      return;
    }
    const doc = this._syncstring.redo();
    if (doc == null) {
      // can't redo if version not defined/not available.
      return;
    }
    const value = doc.to_str();
    this._syncstring.set(value, true);
    this._syncstring.commit();
    // Important: also set codemirror editor state, as for undo above.
    this._get_cm()?.setValueNoJump(value, true);
  }

  async format_action(cmd, args, force_main: boolean = false): Promise<void> {
    const id = this._get_active_id();
    if (this._get_frame_type(id) != "slate" || this.slateEditors[id] == null) {
      super.format_action(cmd, args, force_main);
      return;
    }
    slateFormatAction(this.slateEditors[id], cmd, args);
  }

  public getSlateEditor(id: string): SlateEditor | undefined {
    return this.slateEditors[id];
  }

  public registerSlateEditor(id: string, editor: SlateEditor): void {
    this.slateEditors[id] = editor;
  }
}
