/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Manage a collection of code editors of various files in frame trees...
*/

import { close, filename_extension } from "smc-util/misc";
import { Actions, CodeEditorState } from "../code-editor/actions";
import { get_file_editor } from "../frame-tree/register";
import { redux } from "../../app-framework";

export class CodeEditor {
  public readonly project_id: string;
  public readonly path: string;
  private actions: Actions;

  constructor(project_id: string, path: string) {
    this.project_id = project_id;
    this.path = path;
    const ext = filename_extension(path);
    let editor = get_file_editor(ext, false);
    if (editor == null) {
      // fallback to text
      editor = get_file_editor("txt", false);
    }
    const name = editor.init(this.path, redux, this.project_id);
    this.actions = (redux.getActions(name) as unknown) as Actions; // definitely right
  }

  close(): void {
    const editor = get_file_editor("txt", false);
    if (editor == null) throw Error("bug -- editor must exist");
    editor.remove(this.path, redux, this.project_id);
  }

  get_actions(): Actions {
    return this.actions;
  }
}

export class CodeEditorManager<T extends CodeEditorState = CodeEditorState> {
  private actions: Actions<T>;
  private code_editors: { [id: string]: any } = {};

  constructor(actions: Actions<T>) {
    this.actions = actions;
  }

  close(): void {
    for (let id in this.code_editors) {
      this.close_code_editor(id);
    }
    close(this);
  }

  close_code_editor(id: string): void {
    if (this.code_editors[id] == null) {
      // graceful no-op if no such terminal.
      return;
    }
    this.code_editors[id].close();
    delete this.code_editors[id];
  }

  get_code_editor(id: string, path?: string): CodeEditor | undefined {
    if (path == null) {
      let node = this.actions._get_frame_node(id);
      if (node == null) {
        return;
      }
      path = node.get("path");
      if (path == null || path == this.actions.path) {
        return;
      }
    }
    let code_editor: CodeEditor | undefined = this.code_editors[id];
    if (code_editor != null) {
      if (code_editor.path == path) {
        // It's already initialized.
        return code_editor;
      }
      // It's initialized for this frame, but it's for a different path -- close that.
      this.close_code_editor(id);
    }
    return (this.code_editors[id] = new CodeEditor(
      this.actions.project_id,
      path
    ));
  }

  get(id: string): CodeEditor {
    return this.code_editors[id];
  }
}
