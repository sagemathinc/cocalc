/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Files Listings Editor Actions
*/

//import { project_api } from "../generic/client";
import { path_split } from "@cocalc/util/misc";
import { Map } from "immutable";
import _ from "lodash";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { Favs } from "./types";

export interface State extends CodeEditorState {
  dir?: string;
  favs: Favs;
}

export class Actions extends BaseActions<State> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["type", "key"];
  protected string_cols: string[] = ["strVal"];

  _raw_default_frame_tree(): FrameTree {
    return { type: "files" };
  }

  _init2(): void {
    this.setState({ favs: Map(), dir: "" });

    this._syncstring.on("change", (entries) => {
      let favs = this.store.get("favs");
      const prevFavs = favs;
      let dir = this.store.get("dir");

      entries.forEach((entry) => {
        const type = entry.get("type");
        const key = entry.get("key");
        if (typeof type !== "string") return;
        if (typeof key !== "string") return;

        const value = this._syncstring.get_one(entry);

        switch (type) {
          case "settings":
            const data = value?.get("data");
            switch (key) {
              case "dir":
                if (dir !== data) {
                  this.setState({ dir: data });
                }
            }
            break;
          case "favs":
            // @ts-ignore
            if (value != null) {
              const valueJS = _.omit(value.toJS(), "type", "key");
              // @ts-ignore
              favs = favs.set(key, valueJS);
            } else {
              favs = favs.delete(key);
            }
            break;
        }
      });

      if (favs !== prevFavs) this.setState({ favs });
    });
  }

  toggleFavorite(path, makeFav): void {
    if (makeFav) {
      this._syncstring.set({
        type: "favs",
        key: path,
        time: Date.now().toString(),
      });
    } else {
      this._syncstring.delete({ type: "favs", key: path });
    }
    this.syncstring_commit();
  }

  async setDir(path: string) {
    //const api = await project_api(this.project_id);
    //const cPath = await api.canonical_path(path);
    //const cDir = path_split(cPath).head;
    const dir = path === "" ? "" : path_split(path).head;
    this._syncstring.set({ type: "settings", key: "dir", data: dir });
    this.syncstring_commit();
  }
}
