/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Manage a collection of code editors of various files in frame trees...
*/

import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

import { close, filename_extension } from "@cocalc/util/misc";
import { Actions, CodeEditorState } from "../code-editor/actions";
import { get_file_editor } from "../frame-tree/register";
import { redux } from "../../app-framework";

export class CodeEditor {
  public readonly project_id: string;
  public readonly path: string;
  private actions?: Actions;

  constructor(project_id: string, path: string) {
    this.project_id = project_id;
    this.path = path;
  }

  async init(): Promise<void> {
    const ext = filename_extension(this.path);
    let editor = get_file_editor(ext, false);
    if (editor == null) {
      // fallback to text
      editor = get_file_editor("txt", false);
    }
    let name: string;
    if (editor.init != null) {
      name = editor.init(this.path, redux, this.project_id);
    } else {
      name = await editor.initAsync(this.path, redux, this.project_id);
    }
    this.actions = redux.getActions(name) as unknown as Actions; // definitely right
  }

  close(): void {
    const ext = filename_extension(this.path);
    let editor = get_file_editor(ext, false);
    if (editor == null) {
      // fallback to text
      editor = get_file_editor("txt", false);
    }
    if (editor == null) {
      console.warn("WARNING: editor should exist");
      return;
    }
    editor.remove(this.path, redux, this.project_id);
  }

  get_actions(): Actions | undefined {
    return this.actions;
  }
}

export class CodeEditorManager<T extends CodeEditorState = CodeEditorState> {
  private actions: Actions<T>;
  private code_editors: { [id: string]: any } = {};

  constructor(actions: Actions<T>) {
    this.actions = actions;
    this.init_code_editor = reuseInFlight(this.init_code_editor.bind(this));
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

  async init_code_editor(id: string, path: string): Promise<CodeEditor | null> {
    const e = this.get_code_editor(id, path);
    if (e != null) return e;
    const x = new CodeEditor(this.actions.project_id, path);
    await x.init();
    this.code_editors[id] = x;
    return x;
  }

  get_code_editor(id: string, path?: string): CodeEditor | undefined {
    if (path == null) {
      // actions undefined can happen if called after close;  somebody reported this happening once...
      let node = this.actions?._get_frame_node(id);
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
  }

  get(id: string): CodeEditor {
    return this.code_editors[id];
  }
}
