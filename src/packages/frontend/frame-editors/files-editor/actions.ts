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

import { Favs } from "./types";
import { project_api } from "../generic/client";
import { path_split } from "@cocalc/util/misc";

export interface State extends CodeEditorState {
  dir: string;
  favs: Favs;
}

export class Actions extends BaseActions<State> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["id"];
  protected string_cols: string[] = ["strVal"];

  _raw_default_frame_tree(): FrameTree {
    return { type: "files" };
  }

  _init2(): void {
    this.setState({ favs: Map() });

    this._syncstring.on("change", (keys) => {
      let favs = this.store.get("favs");
      const favsPrev = favs;
      keys.forEach((key) => {
        const id = key.get("id");
        if (typeof id !== "string") return;
        const obj = this._syncstring.get_one(key);
        // @ts-ignore
        favs = favs.set(id, obj);
      });
      if (favs !== favsPrev) {
        this.setState({ favs });
      }
    });
  }

  set(obj: Favs): void {
    this._syncstring.set(obj);
  }

  debugMe(path): void {
    window.alert(`test: path=${path}`);
  }

  async setDir(path: string) {
    const api = await project_api(this.project_id);
    const cPath = await api.canonical_path(path);
    this.setState({ dir: path_split(cPath).head });
  }
}
