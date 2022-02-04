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
import { getPageSpan } from "./math";

function createId(): string {
  return uuid().slice(0, 8);
}

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
      const id = createId();
      obj = { id, ...obj };
    }
    if (obj.z == null) {
      // most calls to createElement should NOT resort to having to do this.
      const { zMax } = getPageSpan(
        this.store.get("elements").toJS() as Element[],
        0
      );
      obj.z = zMax + 1;
    }
    this.setElement(obj, commit);
    return obj as Element;
  }

  delete(id: string): void {
    this._syncstring.delete({ id });
  }

  public clearSelection(frameId: string): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    this.set_frame_tree({ id: frameId, selection: [] });
  }

  // Sets the selection to either a single element or a list
  // of elements, with specified ids.
  // This automatically extends the selection to include the
  // entire group of any element, so it should be impossible
  // to select a partial group, so long as this function is
  // always called to do selection.  (TODO: with realtime
  // collaboration and merging of changes, it is of course possible
  // to break the "can only select complete groups" invariant,
  // without further work.  In miro they don't solve this problem.)
  public setSelection(
    frameId: string,
    id: string,
    type: "add" | "remove" | "only" | "toggle" = "only",
    expandGroups: boolean = true // for internal use when we recurse
  ): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    let selection = node.get("selection")?.toJS() ?? [];
    if (expandGroups) {
      const elements = this.store.get("elements");
      if (elements == null) return;
      const group = elements.getIn([id, "group"]);
      if (group) {
        const ids = getGroup(elements, group);
        if (ids.length > 1) {
          if (type == "toggle") {
            type = selection.includes(id) ? "remove" : "add";
          }
          this.setSelectionMulti(frameId, ids, type, false);
          return;
        }
        // expanding the group did nothing
      }
      // not in a group
    }

    if (type == "toggle") {
      const i = selection.indexOf(id);
      if (i == -1) {
        selection.push(id);
      } else {
        selection.splice(i, 1);
      }
    } else if (type == "add") {
      if (selection.includes(id)) return;
      selection.push(id);
    } else if (type == "remove") {
      const i = selection.indexOf(id);
      if (i == -1) return;
      selection.splice(i, 1);
    } else if (type == "only") {
      selection = [id];
    }
    this.set_frame_tree({ id: frameId, selection });
  }

  public setSelectionMulti(
    frameId: string,
    ids: string[],
    type: "add" | "remove" | "only" = "only",
    expandGroups: boolean = true
  ): void {
    const X = new Set(ids);
    if (expandGroups) {
      // extend id list to contain any groups it intersects.
      const groups = new Set<string>([]);
      const elements = this.store.get("elements");
      if (elements == null) return;
      for (const id of ids) {
        const group = elements.getIn([id, "group"]);
        if (group && !groups.has(group)) {
          groups.add(group);
          for (const id2 of getGroup(elements, group)) {
            X.add(id2);
          }
        }
      }
    }
    if (type == "only") {
      this.clearSelection(frameId);
      type = "add";
    }
    for (const id of X) {
      this.setSelection(frameId, id, type, false);
    }
  }

  // Groups
  // Make it so the elements with the given list of ids
  // form a group.
  public groupElements(ids: string[]) {
    const group = createId();
    // TODO: check that this group id isn't already in use
    for (const id of ids) {
      this.setElement({ id, group }, false);
    }
    this.syncstring_commit();
  }

  // Remove elements with given ids from the group they
  // are in, if any.
  public ungroupElements(ids: string[]) {
    for (const id of ids) {
      // "as any" since null is used for deleting a field.
      this.setElement({ id, group: null as any }, false);
    }
    this.syncstring_commit();
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

  // TODO: serious concern -- this visibleWindow stuff is getting persisted
  // to localStorage, but doesn't need to be, which is a waste.
  saveVisibleWindow(
    id: string,
    visibleWindow: { xMin: number; yMin: number; xMax: number; yMax: number }
  ): void {
    const node = this._get_frame_node(id);
    if (node == null) return;
    this.set_frame_tree({ id, visibleWindow });
  }

  setVisibleWindowCenter(id: string, center: { x: number; y: number }) {
    const node = this._get_frame_node(id);
    if (node == null) return;
    this.set_frame_tree({ id, visibleWindowCenter: center });
  }

  // define this, so icon shows up at top
  zoom_page_width(id: string): void {
    this.fitToScreen(id);
  }
}

function getGroup(elements, group: string): string[] {
  const ids: string[] = [];
  if (!group) return ids;
  for (const [id, element] of elements) {
    if (element?.get("group") == group) {
      ids.push(id);
    }
  }
  return ids;
}
