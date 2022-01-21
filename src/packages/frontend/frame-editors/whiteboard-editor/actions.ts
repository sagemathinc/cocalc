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

import { Object, Objects } from "./types";

export interface State extends CodeEditorState {
  objects: Objects;
}

export class Actions extends BaseActions<State> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["id"];
  protected string_cols: string[] = ["strVal"];

  _raw_default_frame_tree(): FrameTree {
    return { type: "whiteboard" };
  }

  _init2(): void {
    this.setState({ objects: Map({}) });

    this._syncstring.on("change", (keys) => {
      let objects = this.store.get("objects");
      const objects0 = objects;
      keys.forEach((key) => {
        const id = key.get("id");
        if (id) {
          const obj = this._syncstring.get_one(key);
          // @ts-ignore
          objects = objects.set(id, obj);
        }
      });
      if (objects !== objects0) {
        this.setState({ objects });
      }
    });
  }

  set(obj: Object): void {
    this._syncstring.set(obj);
  }
}
