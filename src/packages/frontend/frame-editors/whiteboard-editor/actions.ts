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

import { Element, Elements } from "./types";

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

  set(obj: Element): void {
    this._syncstring.set(obj);
  }

  zoom_page_width(id: string): void {
    console.log("TODO - zoom_page_width!", id);
  }

  zoom_page_height(id: string): void {
    console.log("TODO - zoom_page_height!", id);
  }
}
