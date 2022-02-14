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
import { Element, Elements, Point, Rect } from "./types";
import { uuid } from "@cocalc/util/misc";
import {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  getPageSpan,
  compressPath,
  drawEdge,
  centerRectsAt,
  translateRectsZ,
} from "./math";
import { Position as EdgeCreatePosition } from "./focused-edge-create";
import { debounce, cloneDeep, isEqual } from "lodash";
import runCode from "./elements/code/run";
import { lastMessageNumber } from "./elements/chat";

export interface State extends CodeEditorState {
  elements?: Elements;
}

export class Actions extends BaseActions<State> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["id"];
  protected string_cols: string[] = ["strVal"];

  _raw_default_frame_tree(): FrameTree {
    return { type: "whiteboard" };
  }

  _init2(): void {
    this.updateEdges = debounce(this.updateEdgesNoDebounce.bind(this), 250);
    this.setState({});
    this._syncstring.on("change", (keys) => {
      const elements0 = this.store.get("elements");
      let elements = elements0 ?? Map({});
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
    if (
      obj.type != "edge" &&
      (obj.x != null || obj.y != null || obj.h != null || obj.w != null)
    ) {
      this.updateEdges();
    }
    if (commit) {
      this.syncstring_commit();
    }
  }

  // Merge obj into data field of element with given id.
  setElementData(element: Element, obj: object, commit: boolean = true): void {
    this.setElement(
      { id: element.id, data: { ...element.data, ...obj } },
      commit
    );
  }

  private createId(): string {
    // TODO: make this ensure id is unique!
    return uuid().slice(0, 8);
  }

  private getPageSpan(margin: number = 0) {
    const elements = (this.store
      .get("elements")
      ?.valueSeq()
      .filter((x) => x != null)
      .toJS() ?? []) as Element[];
    return getPageSpan(elements, margin);
  }

  createElement(obj: Partial<Element>, commit: boolean = true): Element {
    if (obj.id == null) {
      const id = this.createId();
      obj = { id, ...obj };
    }
    if (obj.z == null) {
      // most calls to createElement should NOT resort to having to do this.
      obj.z = this.getPageSpan().zMax + 1;
    }
    if (obj.w == null) {
      obj.w = DEFAULT_WIDTH;
    }
    if (obj.h == null) {
      obj.h = DEFAULT_HEIGHT;
    }
    this.setElement(obj, commit);
    return obj as Element;
  }

  delete(id: string, commit: boolean = true): void {
    this._syncstring.delete({ id });
    if (commit) {
      this.syncstring_commit();
    }
  }

  public clearSelection(frameId: string): void {
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
    const group = this.createId();
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
    this.set_frame_tree({
      id: frameId,
      selectedTool,
      selectedToolHidePanel:
        node.get("selectedTool") == selectedTool &&
        !node.get("selectedToolHidePanel"),
    });
  }

  undo(_id: string): void {
    this._syncstring.undo();
    this._syncstring.commit();
  }

  redo(_id: string): void {
    this._syncstring.redo();
    this._syncstring.commit();
  }

  fitToScreen(id: string, state: boolean = true): void {
    this.set_frame_tree({ id, fitToScreen: state ? true : undefined });
  }

  toggleMap(id: string): void {
    const node = this._get_frame_node(id);
    if (node == null) return;
    this.set_frame_tree({ id, hideMap: !node.get("hideMap") });
  }

  // The viewport = exactly the part of the canvas that is VISIBLE to the user
  // in data coordinates, of course, like everything here.
  saveViewport(id: string, viewport: Rect): void {
    this.set_frame_tree({ id, viewport });
  }

  setViewportCenter(id: string, center: { x: number; y: number }) {
    this.set_frame_tree({ id, viewportCenter: center });
  }

  saveCenter(id: string, center: { x: number; y: number }) {
    this.set_frame_tree({ id, center });
  }

  // define this, so icon shows up at top
  zoom_page_width(id: string): void {
    this.fitToScreen(id);
  }

  // maybe this should NOT be in localStorage somehow... we need something like frame tree state that isn't persisted...
  setEdgeCreateStart(
    id: string,
    eltId: string,
    position: EdgeCreatePosition
  ): void {
    this.set_frame_tree({ id, edgeStart: { id: eltId, position } });
  }

  clearEdgeCreateStart(id: string): void {
    this.set_frame_tree({ id, edgeStart: null });
  }

  // returns created element or null if from or to don't exist...
  createEdge(from: string, to: string): Element | undefined {
    const elements = this.store.get("elements");
    if (elements == null) return;
    const fromElt = elements.get(from)?.toJS();
    const toElt = elements.get(to)?.toJS();
    if (fromElt == null || toElt == null) return;
    const { rect, path, dir } = drawEdge(fromElt, toElt);
    const z = this.getPageSpan().zMin - 1;

    return this.createElement({
      ...rect,
      z,
      type: "edge",
      data: { from, to, path: compressPath(path), dir: compressPath(dir) },
    });
  }

  // recompute the parameters of all edges, in case vertices
  // have moved.
  // TODO: optimize to only do this when necessary!
  updateEdges() {} // gets set to a debounced version.
  updateEdgesNoDebounce() {
    const elements = this.store.get("elements");
    if (elements == null) return;
    let changed = false;
    for (const [id, element0] of elements) {
      if (element0?.get("type") !== "edge") continue;
      const element = element0.toJS();
      const { from, to } = element.data ?? {};
      if (!from || !to) continue;
      const fromElt = elements.get(from)?.toJS();
      const toElt = elements.get(to)?.toJS();
      if (fromElt == null || toElt == null) {
        // adjacent vertex deleted, so delete this edge.
        this.delete(id, false);
        changed = true;
        continue;
      }
      const { rect, path, dir } = drawEdge(fromElt, toElt);
      // Usually nothing changed!  This is so dumb for a first round!
      const element1 = {
        ...element,
        ...rect,
        data: {
          ...element.data,
          path: compressPath(path),
          dir: compressPath(dir),
        },
      };
      if (!isEqual(element, element1)) {
        changed = true;
        this.setElement(element1, false);
      }
    }
    if (changed) {
      this.syncstring_commit();
    }
  }

  // Used for copy/paste, and maybe templates later.
  // Inserts the given elements, moving them so the center
  // of the rectangle spanned by all elements is the given
  // center point, or (0,0) if not given.
  // Returns the ids of the inserted elements.
  insertElements(elements: Element[], center?: Point): string[] {
    elements = cloneDeep(elements); // we will mutate it a lot
    if (center != null) {
      centerRectsAt(elements, center);
    }
    translateRectsZ(elements, this.getPageSpan().zMax + 1);
    const ids: string[] = [];
    const idMap: { [id: string]: string } = {};
    for (const element of elements) {
      idMap[element.id] = this.createId();
      element.id = idMap[element.id];
      ids.push(element.id);
    }
    // We adjust any edges below, discarding any that aren't
    // part of what is being pasted.
    for (const element of elements) {
      if (element.type == "edge" && element.data != null) {
        // need to update adjacent vertices.
        const from = idMap[element.data.from ?? ""];
        if (from == null) continue;
        element.data.from = from;
        const to = idMap[element.data.to ?? ""];
        if (to == null) continue;
        element.data.to = to;
      }
      this.createElement(element, false);
    }
    this.syncstring_commit();
    return ids;
  }

  // There may be a lot of options for this...
  runCodeElement({ id }: { id: string }) {
    const element = this.store.get("elements")?.get(id)?.toJS();
    if (element == null) {
      // no-op no such element
      // TODO?!
      console.warn("no cell with id", id);
      return;
    }
    runCode({
      project_id: this.project_id,
      path: this.path,
      input: element.str ?? "",
      id,
      set: (obj) => this.setElementData(element, obj),
    });
  }

  sendChat({ id, input }: { id: string; input: string }) {
    const element = this.store.get("elements")?.get(id)?.toJS();
    if (element == null) {
      // no-op no such element - TODO
      console.warn("no cell with id", id);
      return;
    }
    const sender_id = this.redux.getStore("account").get_account_id();
    this.setElementData(element, {
      [lastMessageNumber(element) + 1]: {
        input,
        time: new Date().valueOf(),
        sender_id,
      },
    });
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
