/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Whiteboard FRAME Editor Actions
*/

import { Map } from "immutable";
import { FrameTree } from "../frame-tree/types";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { Tool } from "./tools/spec";
import { Element, Elements } from "./types";
import { uuid } from "@cocalc/util/misc";

export interface State extends CodeEditorState {
  elements: Elements;
}

export class Actions extends BaseActions<State> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["id"];
  protected string_cols: string[] = ["strVal"];

  _raw_default_frame_tree(): FrameTree {
    return { type: "whiteboard" };
  }

  _init2(): void {
    this.setState({ elements: Map({}) });

    this._syncstring.on("change", (keys) => {
      let elements = this.store.get("elements");
      const elements0 = elements;
      keys.forEach((key) => {
        const id = key.get("id");
        if (id) {
          const obj = this._syncstring.get_one(key);
          // @ts-ignore
          elements = elements.set(id, obj);
        }
      });
      if (elements !== elements0) {
        this.setState({ elements });
      }
    });
  }

  setElement(obj: Partial<Element>, commit: boolean = true): void {
    this._syncstring.set(obj);
    if (commit) {
      this.syncstring_commit();
    }
  }

  createElement(obj: Partial<Element>, commit: boolean = true): Element {
    if (obj.id == null) {
      // todo -- need to avoid any possible conflict by regen until unique
      const id = uuid().slice(0, 8);
      obj = { id, ...obj };
    }
    this.setElement(obj, commit);
    return obj as Element;
  }

  delete(id: string): void {
    this._syncstring.delete({ id });
  }

  public setFocusedElement(frameId: string, focusedId: string): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    this.set_frame_tree({ id: frameId, focusedId });
  }

  public setSelectedTool(frameId: string, selectedTool: Tool): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    this.set_frame_tree({ id: frameId, selectedTool });
  }

  undo(_id: string): void {
    this._syncstring.undo();
    this._syncstring.commit();
  }

  redo(_id: string): void {
    this._syncstring.redo();
    this._syncstring.commit();
  }

  fitToScreen(id: string): void {
    this.set_frame_tree({ id, fitToScreen: true });
  }

  toggleMap(id: string): void {
    const node = this._get_frame_node(id);
    if (node == null) return;
    this.set_frame_tree({ id, hideMap: !node.get("hideMap") });
  }

  // define this, so icon shows up at top
  zoom_page_width(id: string): void {
    this.fitToScreen(id);
  }
}
