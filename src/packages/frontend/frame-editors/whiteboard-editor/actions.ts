/*
 *  This file is part of CoCalc: Copyright © 2022-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Whiteboard frame Editor Actions
*/

import Fragment, { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { Map as ImmutableMap, fromJS } from "immutable";
import type { FrameTree } from "../frame-tree/types";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "../code-editor/actions";
import { setDefaultSize, Tool } from "./tools/desc";
import {
  Data,
  Element,
  ElementsMap,
  ElementType,
  MainFrameType,
  PagesMap,
  SortedPageList,
  Point,
  Rect,
  Placement,
} from "./types";
import { uuid, field_cmp } from "@cocalc/util/misc";
import {
  DEFAULT_GAP,
  getPageSpan,
  centerRectsAt,
  centerOfRect,
  topOfRect,
  rectSpan,
  translateRectsZ,
  roundRectParams,
  moveRectAdjacent,
  moveUntilNotIntersectingAnything,
  getOverlappingElements,
} from "./math";
import {
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
} from "./tools/defaults";
import { Position as EdgeCreatePosition } from "./focused-edge-create";
import { cloneDeep, debounce, size } from "lodash";
import runCode from "./elements/code/run";
import { getName } from "./elements/chat";
import { clearChat, lastMessageNumber } from "./elements/chat-static";
import { copyToClipboard } from "./tools/clipboard";
import getKeyHandler from "./key-handler";
import { pasteFromInternalClipboard } from "./tools/clipboard";
import {
  TableOfContentsEntryList,
  TableOfContentsEntry,
} from "@cocalc/frontend/components";
import parseTableOfContents from "./table-of-contents";
import { delay } from "awaiting";
import { open_new_tab } from "@cocalc/frontend/misc";
import debug from "debug";
import { moveCell } from "@cocalc/jupyter/util/cell-utils";
import { migrateToNewPageNumbers } from "./migrate";
import { toMarkdown, elementToMarkdown } from "./export";

const log = debug("whiteboard:actions");

export interface State extends CodeEditorState {
  elements?: ElementsMap;
  pages?: PagesMap;
  sortedPageIds?: SortedPageList;
  introspect?: ImmutableMap<string, any>; // used for jupyter cells -- displayed in a separate frame.
  contents?: TableOfContentsEntryList; // table of contents data.
}

export class Actions<T extends State = State> extends BaseActions<T | State> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["id"];
  protected string_cols: string[] = ["str"];
  protected searchEmbeddings = {
    primaryKey: "id",
    textColumn: "str",
    metaColumns: ["type"],
  };
  private keyHandler?: (event) => void;
  readonly mainFrameType: MainFrameType = "whiteboard";
  // fixedElements are on every page automatically.
  // They should have {data:{selectable:false},...}
  readonly fixedElements: { [id: string]: Element } = {};

  _raw_default_frame_tree(): FrameTree {
    // return { type: this.mainFrameType };
    return {
      direction: "col",
      type: "node",
      first: { type: this.mainFrameType },
      second: {
        direction: "row",
        type: "node",
        pos: 0.6,
        first: { type: "pages" },
        second: { type: "search" },
      },
      pos: 0.8,
    };
  }

  _init2(): void {
    this.setState({});
    this._syncstring.on(
      "change",
      debounce(this.updateTableOfContents.bind(this), 1500),
    );
    const handleChange = (keys) => {
      const elements0 = this.store.get("elements");

      if (
        // if it's the first load check to see if a random element has a numerical page number;
        // if so, we have to migrate this.
        elements0 == null &&
        typeof this._syncstring.get_one()?.get("page") == "number"
      ) {
        // This modifies the syncdoc in one commit:
        migrateToNewPageNumbers(this._syncstring);
        // We then handle that everything changed:
        handleChange(
          this._syncstring.get().map((x) => {
            return fromJS({ id: x.get("id") });
          }),
        );
        // and don't do the handling below, obviously.
        return;
      }

      const pages0 = this.store.get("pages");
      const sortedPageIds0 = this.store.get("sortedPageIds");
      let somePageChanged = false;
      let elements = elements0 ?? ImmutableMap({});
      let pages: PagesMap = (pages0 ?? ImmutableMap()) as PagesMap;
      for (const key of keys) {
        const id = key.get("id");
        if (!id) continue;
        const element = this._syncstring.get_one(key);
        if (element?.get("invisible")) continue;
        const oldElement = elements.get(id);
        if (!element) {
          // there is a delete.
          if (oldElement?.get("type") == "page") {
            // deleting a page
            pages = pages.delete(oldElement.get("id"));
          } else {
            // deleting an element on a page
            const page = oldElement?.get("page");
            if (page) {
              let elementsOnPage = pages.get(page);
              if (elementsOnPage != null) {
                elementsOnPage = elementsOnPage.delete(id);
                pages = pages.set(page, elementsOnPage);
              }
            }
          }
          elements = elements.delete(id);
        } else if (!element.get("type")) {
          // no valid type field - discard
          this._syncstring.delete({ id });
          elements = elements.delete(id);
          const page = oldElement?.get("page");
          if (page) {
            let elementsOnPage = pages.get(page);
            if (elementsOnPage != null) {
              elementsOnPage = elementsOnPage.delete(id);
              pages = pages.set(page, elementsOnPage);
            }
          }
        } else if (element.get("type") == "page") {
          // this is a page
          somePageChanged = true;
          if (!pages.has(id)) {
            pages = pages.set(
              id,
              ImmutableMap(fromJS(this.fixedElements)) as any,
            );
          }
          elements = elements.set(id, element);
        } else {
          // create or change an element on a specific page
          // @ts-ignore
          elements = elements.set(id, element);
          const oldPage = oldElement?.get("page");
          const newPage = element.get("page");
          if (newPage) {
            const elementsOnNewPage =
              pages.get(newPage) ?? ImmutableMap(fromJS(this.fixedElements));
            pages = pages.set(
              newPage,
              elementsOnNewPage.set(id, element) as any,
            );
          }
          if (oldPage && oldPage != newPage) {
            // change page, so delete element from the old page
            let elementsOnOldPage = pages.get(oldPage);
            if (elementsOnOldPage !== undefined) {
              elementsOnOldPage = elementsOnOldPage.delete(id);
              if (elementsOnOldPage.size == 0) {
                pages = pages.delete(oldPage);
              } else {
                pages = pages.set(oldPage, elementsOnOldPage);
              }
            }
          }
        }
      }

      if (elements !== elements0) {
        this.setState({ elements });
      }

      if (
        somePageChanged ||
        sortedPageIds0 == null ||
        pages.size != pages0?.size
      ) {
        const v: { id: string; pos: number }[] = [];
        for (const [id] of pages ?? []) {
          v.push({
            id,
            pos: elements.getIn([id, "data", "pos"], 0) as number,
          });
        }
        v.sort(field_cmp("pos"));
        const sortedPageIds = fromJS(v.map((x) => x.id));
        this.setState({ sortedPageIds });
      }

      if (pages != pages0) {
        this.setState({ pages });
        if (pages.size != pages0?.size) {
          // number of pages changed -- update the page count for every frame.
          for (const frameId in this._get_leaf_ids()) {
            this.setPages(frameId, pages.size);
          }
        }
      }

      if (pages.size == 0 && pages0 == null) {
        setTimeout(() => this.createPage(), 0);
      }
    };

    this._syncstring.on("change", handleChange);
  }

  // This mutates the cursors by putting the id in them.
  setCursors(id: string, cursors: object[], sideEffect?: boolean): void {
    if (this._syncstring == null) return;
    for (const cursor of cursors) {
      cursor["id"] = id;
    }
    this._syncstring.set_cursor_locs(cursors, sideEffect);
  }

  private idToElement(id: string): Element | undefined {
    return this.store.getIn(["elements", id])?.toJS();
  }

  // Create element adjacent to the one with given id.
  // It should be very similar to that one, but with empty content.
  // No op if id doesn't exist.
  createAdjacentElement(
    id: string, // id of existing element
    placement: Placement = "bottom",
    commit: boolean = true,
  ): string | undefined {
    if (this._syncstring == null) return;
    const element = this._syncstring.get_one({ id })?.toJS();
    if (element == null) return;
    delete element.z; // so it is placed at the top
    delete element.locked; // so it isn't locked; copy should never be locked
    let clearedContent = false;
    if (element.str != null) {
      clearedContent = true;
      element.str = "";
    }
    if (element.data?.output != null) {
      clearedContent = true;
      // code cell
      delete element.data.output;
    }
    if (element.type == "chat") {
      clearedContent = true;
      clearChat(element);
    }
    moveRectAdjacent(element, placement);

    // Next move the new element orthogonal to offset (but minimal in
    // distance) from id so that it doesn't intersect
    // any existing elements. E.g., if placement is 'right',
    // move it up or down as needed so it doesn't intersect anything.
    // TODO: algorithm for doing this is not particular efficient,
    // and scales with number of elements in scene.  It might
    // be much faster to restrict to nearby elements only...?

    // Note: if the element is not a frame itself, we don't move it
    // so it avoids intersecting other frames.  E.g., if a note is
    // in a frame, we should get another note possibly in the frame
    // that is adjacent.
    const page = element.page ?? this.defaultPageId();
    const filter =
      element.type == "frame"
        ? undefined
        : (elt) =>
            elt.get("type") != "frame" &&
            (elt.get("page") ?? this.defaultPageId()) == page;
    const elements = this.getElements(filter);
    const p = placement.toLowerCase();
    const axis = p.includes("top") || p.includes("bottom") ? "x" : "y";
    moveUntilNotIntersectingAnything(element, elements, axis);

    // only after moving, do this, so size will be the default, since we
    // emptied the object content:
    if (clearedContent) {
      delete element.w;
      delete element.h;
    }
    return this.createElement(undefined, element, commit).id;
  }

  setElement({
    obj,
    commit = true,
    cursors,
    create,
  }: {
    obj: Partial<Element>;
    commit?: boolean;
    cursors?: object[];
    create?: boolean;
  }): void {
    if (this._syncstring == null) return;
    if (obj?.id == null) {
      throw Error(`setElement -- id must be specified`);
    }
    if (!create && this._syncstring.get_one({ id: obj.id }) == null) {
      // object already deleted, so setting it is a no-op
      // This happens, e.g., if you delete a note while editing it,
      // then unmounting the note causes a final save, though the object
      // is already deleted at that point.
      return;
    }
    // We always round x,y,w,h (if present) to nearest integers,
    // since this makes very little difference when rendering
    // (none at 100% zoom), and saves a lot of space in the
    // JSON object representation.
    roundRectParams(obj);
    this._syncstring.set(obj);
    if (commit) {
      this.syncstring_commit();
    }
    if (cursors != null) {
      this.setCursors(obj.id, cursors);
    }
  }

  // Merge obj into data field of element with given id.
  setElementData({
    element,
    obj,
    commit,
    cursors,
  }: {
    element: Element;
    obj: Data;
    commit?: boolean;
    cursors?: object[];
  }): void {
    if (commit == null) commit = true;
    this.setElement({
      obj: { id: element.id, data: { ...element.data, ...obj } },
      commit,
      cursors,
    });
  }

  // create a new valid id.  If id is given, will try to use
  // it if it isn't currently in use.
  private createId(id?: string): string {
    const elements = this.store.get("elements");
    if (elements == null) {
      // fallback for weird edge case.
      return uuid().slice(0, 8);
    }
    while (!id || elements.has(id)) {
      id = uuid().slice(0, 8);
    }
    return id;
  }

  private getGroupIds(): Set<string> {
    const X = new Set<string>([]);
    this.store.get("elements")?.map((element) => {
      const group = element.get("group");
      if (group != null) {
        X.add(group);
      }
    });
    return X;
  }

  private createGroupId(avoid?: Set<string>): string {
    const X = this.getGroupIds();
    while (true) {
      const id = uuid().slice(0, 8);
      if (!X.has(id) && (avoid == null || !avoid.has(id))) return id;
    }
  }

  getElement(id: string): Element | undefined {
    return this.store.getIn(["elements", id])?.toJS();
  }

  private getElements(filter?: (ImmutableMap) => boolean): Element[] {
    let elements = this.store.get("elements");
    if (filter != null) {
      elements = elements?.filter((elt) => elt != null && filter(elt));
    }
    return (elementsList(elements) ?? []) as Element[];
  }

  private getPageSpan(margin: number = 0) {
    const elements = this.getElements();
    return getPageSpan(elements, margin);
  }

  createElement(
    frameId: string | undefined,
    obj: Partial<Element>,
    commit: boolean = true,
  ): Element {
    log("createElement", frameId, obj, commit);
    if (obj.id == null || this.store.getIn(["elements", obj.id])) {
      obj.id = this.createId(); // ensure a new id is used, if needed.
    }
    if (obj.z == null) {
      // most calls to createElement should NOT resort to having to do this.
      obj.z = this.getPageSpan().zMax + 1;
    }
    if ((obj.w == null || obj.h == null) && obj.type) {
      setDefaultSize(obj);
    }
    if (obj.page == null) {
      const pages = this.sortedPageIds();
      obj.page =
        frameId == null
          ? this.defaultPageId()
          : (pages.get((this._get_frame_node(frameId)?.get("page") ?? 1) - 1) ??
            this.defaultPageId());
    }

    // Remove certain fields that never ever make no sense for a new element
    // E.g., this runState and start would come up pasting or creating an
    // adjacent code cell, but obviously the code isn't also running in the
    // new cell, which has a different id.
    if (obj.data != null) {
      delete obj.data.runState;
      delete obj.data.start;
    }

    this.setElement({ create: true, obj, commit, cursors: [{}] });
    return obj as Element;
  }

  delete(id: string, commit: boolean = true): void {
    if (this._syncstring == null) return;
    if (this.isLocked(id)) return; // todo -- show a message
    this._syncstring.delete({ id });
    // also delete any adjacent edges.
    // TODO: this is worrisomely inefficient!
    const elements = this.store.get("elements");
    if (elements == null) return;
    for (const [id2, element] of elements) {
      if (
        element != null &&
        element.get("type") == "edge" &&
        (element.getIn(["data", "from"]) == id ||
          element.getIn(["data", "to"]) == id)
      ) {
        this._syncstring.delete({ id: id2 });
      }
    }
    if (commit) {
      this.syncstring_commit();
    }
  }

  deleteElements(elements: Element[], commit: boolean = true): void {
    if (this._syncstring == null) return;
    for (const { id } of elements) {
      this.delete(id, false);
    }
    if (commit) {
      this.syncstring_commit();
    }
  }

  private setFragmentIdToPage(frameId: string): void {
    const node = this._get_frame_node(frameId);
    if (node?.get("type") != this.mainFrameType) return;
    const page = node?.get("page");
    if (this.store.get("visible")) {
      if (page != null) {
        const pageId = this.store.get("sortedPageIds")?.get(page - 1);
        if (pageId) {
          Fragment.set({ page: pageId });
        }
      } else {
        Fragment.clear();
      }
    }
  }

  clearSelection(frameId: string): void {
    const node = this._get_frame_node(frameId);
    if (node == null || (node.get("selection")?.size ?? 0) == 0) return;
    this.set_frame_tree({ id: frameId, selection: [], editFocus: false });
    this.setFragmentIdToPage(frameId);
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
    expandGroups: boolean = true, // for internal use when we recurse
  ): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    let selection = node.get("selection")?.toJS() ?? [];
    try {
      if (expandGroups) {
        const elements = this.store.get("elements");
        if (elements == null) return;
        const group = elements.getIn([id, "group"]) as string | undefined;
        if (group) {
          const ids = this.getGroup(group).map((e) => e.id);
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
      this.setEditFocus(frameId, type == "only" && size(selection) == 1);
      this.set_frame_tree({ id: frameId, selection });
    } finally {
      if (node.get("type") != this.mainFrameType) return;

      if (this.store.get("visible")) {
        if (size(selection) == 0) {
          this.setFragmentIdToPage(frameId);
        } else {
          Fragment.set({ id: selection[0] });
        }
      }
    }
  }

  public setSelectionMulti(
    frameId: string,
    ids: string[],
    type: "add" | "remove" | "only" = "only",
    expandGroups: boolean = true,
  ): void {
    const X = new Set(ids);
    if (expandGroups) {
      // extend id list to contain any groups it intersects.
      const groups = new Set<string>([]);
      const elements = this.store.get("elements");
      if (elements == null) return;
      for (const id of ids) {
        const group = elements.getIn([id, "group"]) as string | undefined;
        if (group && !groups.has(group)) {
          groups.add(group);
          for (const e of this.getGroup(group)) {
            X.add(e.id);
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
    // do not set in edit mode when selecting 1 or more things; in particular,
    // don't for selecting just one, undoing what setSelection does, which is
    // to set edit focus for one.
    this.setEditFocus(frameId, false);
  }

  // Groups
  // Make it so the elements with the given list of ids
  // form a group.
  public groupElements(ids: string[]) {
    const group = this.createGroupId();
    // TODO: check that this group id isn't already in use
    for (const id of ids) {
      this.setElement({ obj: { id, group }, commit: false });
    }
    this.syncstring_commit();
  }

  // Remove elements with given ids from the group they
  // are in, if any.
  public ungroupElements(ids: string[]) {
    for (const id of ids) {
      // "as any" since null is used for deleting a field.
      this.setElement({ obj: { id, group: null as any }, commit: false });
    }
    this.syncstring_commit();
  }

  public setSelectedTool(frameId: string, selectedTool: Tool): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    this.clearSelection(frameId);
    this.set_frame_tree({
      id: frameId,
      selectedTool,
      selectedToolHidePanel:
        node.get("selectedTool") == selectedTool &&
        !node.get("selectedToolHidePanel"),
    });
  }

  undo(_id?: string): void {
    if (this._syncstring == null) return;
    this._syncstring.undo();
    this._syncstring.commit();
  }

  redo(_id?: string): void {
    if (this._syncstring == null) return;
    this._syncstring.redo();
    this._syncstring.commit();
  }

  in_undo_mode(): boolean {
    return this._syncstring?.in_undo_mode();
  }

  fitToScreen(frameId, state: boolean = true): void {
    this.set_frame_tree({ id: frameId, fitToScreen: state ? true : undefined });
  }

  toggleMapType(id: string): void {
    const node = this._get_frame_node(id);
    if (node == null) return;
    let cur = node.get("navMap") ?? "map";
    if (cur == "map") {
      cur = "preview";
    } else if (cur == "preview") {
      cur = "hide";
    } else {
      cur = "map";
    }
    this.set_frame_tree({ id, navMap: cur });
  }

  // The viewport = exactly the part of the canvas that is VISIBLE to the user
  // in data coordinates, of course, like everything here.
  saveViewport(id: string, viewport: Rect | null): void {
    this.set_frame_tree({ id, viewport });
  }

  setViewportCenter(frameId: string, center: Point) {
    // translates whatever the last saved viewport is to have the given center.
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    const viewport = node.get("viewport")?.toJS();
    if (viewport == null) return;
    centerRectsAt([viewport], center);
    this.saveViewport(frameId, viewport);
  }

  // define this, so icon shows up at top
  zoom_page_width(frameId: string): void {
    this.fitToScreen(frameId);
  }

  zoom100(frameId: string) {
    this.set_font_size(frameId, DEFAULT_FONT_SIZE);
  }

  // maybe this should NOT be in localStorage somehow... we need
  // something like frame tree state that isn't persisted...
  setEdgeCreateStart(
    id: string,
    eltId: string,
    position?: EdgeCreatePosition,
  ): void {
    this.set_frame_tree({ id, edgeStart: { id: eltId, position } });
  }

  clearEdgeCreateStart(id: string): void {
    this.set_frame_tree({ id, edgeStart: null });
  }

  // returns created element or null if from or to don't exist...
  createEdge(
    frameId: string,
    from: string,
    to: string,
    data?: Data,
  ): Element | undefined {
    if (from == to) {
      // no loops
      return;
    }
    return this.createElement(frameId, {
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      type: "edge",
      data: { from, to, ...data },
    });
  }

  // Used for copy/paste, and maybe templates later.
  // Inserts the given elements, moving them so the center
  // of the rectangle spanned by all elements is the given
  // center point, or (0,0) if not given.
  // ids of elements are updated to not conflict with existing ids.
  // Also ensures all are not locked.
  // Also, any groups are remapped to new groups, to avoid "expanding" existing groups.
  // Returns the ids of the inserted elements.
  insertElements(
    frameId: string | undefined,
    elements: Element[],
    center?: Point,
  ): string[] {
    elements = cloneDeep(elements); // we will mutate it a lot
    if (center != null) {
      centerRectsAt(elements, center);
    }
    translateRectsZ(elements, this.getPageSpan().zMax + 1);
    const ids: string[] = [];
    const idMap: { [id: string]: string } = {};
    const groupMap: { [id: string]: string } = {};
    for (const element of elements) {
      // Note that we try to use the existing id if available, in order to keep
      // object id's stable under cut/paste, which is useful for making links
      // more robust.
      const newId = this.createId(element.id);
      idMap[element.id] = newId;
      ids.push(newId);
      element.id = newId;
      delete element.locked;
      if (element.group != null) {
        let newGroupId = groupMap[element.group];
        if (newGroupId == null) {
          newGroupId = this.createGroupId(new Set(Object.keys(groupMap)));
          groupMap[element.group] = newGroupId;
        }
        element.group = newGroupId;
      }
    }
    // We adjust any edges below, discarding any that aren't
    // part of what is being pasted. We also update the page
    // number for every element below.
    const page =
      frameId != null
        ? this.numberToPageId(this._get_frame_node(frameId)?.get("page"))
        : this.defaultPageId();
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
      element.page = page; // should all get inserted on the current page.
      this.createElement(frameId, element, false);
    }
    this.syncstring_commit();
    return ids;
  }

  // There may be a lot of options for this...

  runCodeElement({
    id,
    str,
  }: {
    id: string; // id of cell to run
    // str of input-- we allow specifying this instead of taking it from the store,
    // in case it just changed and hasn't been saved to the store yet.
    str?: string;
  }) {
    const element = this.store.get("elements")?.get(id)?.toJS();
    if (element == null || element.type != "code") {
      // no-op no such element
      console.warn("no cell with id", id);
      return;
    }
    runCode({
      project_id: this.project_id,
      path: this.path,
      input: str ?? element.str ?? "",
      id,
      set: (obj) =>
        this.setElementData({
          element,
          obj: { ...obj, hideOutput: false },
          commit: true,
          cursors: [{}],
        }),
    });
  }

  saveChat({ id, input }: { id: string; input: string }) {
    const element = this.store.get("elements")?.get(id)?.toJS();
    if (element == null) {
      // no-op no such element - TODO
      console.warn("no cell with id", id);
      return;
    }
    const time = Date.now();
    const sender_id = this.redux.getStore("account").get_account_id();
    const sender_name = getName(sender_id);
    this.setElementData({
      element,
      obj: { [sender_id]: { input, time, sender_name } },
      commit: true,
      cursors: [{}],
    });
  }

  sendChat({ id, input }: { id: string; input: string }) {
    const element = this.store.get("elements")?.get(id)?.toJS();
    if (element == null) {
      // no-op no such element - TODO
      console.warn("no cell with id", id);
      return;
    }
    const time = Date.now();
    const sender_id = this.redux.getStore("account").get_account_id();
    // We also record (reasonably truncated) sender name, just in case
    // they are no longer a collaborator with user who is looking at
    // some version of this chat in the future.  Also, for public rendering,
    // it is nice to have this.  Of course, user could change their name.
    const sender_name = getName(sender_id);
    const last = lastMessageNumber(element);
    if (last >= 0) {
      // Check for case of multiple messages from the same sender in a row.
      const lastMessage = element.data?.[last];
      if (
        lastMessage?.sender_id == sender_id &&
        lastMessage.time > time - 1000 * 60
      ) {
        // Same user is sending another message less than a minute from their
        // previous message.  In this case, we just edit the previous message.
        this.setElementData({
          element,
          obj: {
            [last]: {
              input: lastMessage.input + "\n\n" + input,
              time,
              sender_id,
              sender_name,
            },
            [sender_id]: null, // delete saved composing message
          },
          commit: true,
          cursors: [{}],
        });
        return;
      }
    }

    this.setElementData({
      element,
      obj: {
        [lastMessageNumber(element) + 1]: {
          input,
          time,
          sender_id,
          sender_name,
        },
        [sender_id]: null, // delete saved composing message
      },
      commit: true,
      cursors: [{}],
    });
  }

  private getSelectedElements(frameId: string): undefined | Element[] {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    const selection = node.get("selection");
    if (selection == null) return;
    const elements: Element[] = [];
    const X = this.store.get("elements");
    if (X == null) return;
    for (const id of selection) {
      const element = X.get(id)?.toJS();
      if (element != null) {
        elements.push(element);
      }
    }
    return elements;
  }

  cut(frameId: string) {
    const elements = this.getSelectedElements(frameId);
    if (!elements) return;
    extendToIncludeEdges(elements, this.getElements());
    copyToClipboard(elements);
    this.deleteElements(elements);
    this.clearSelection(frameId);
  }

  copy(frameId: string) {
    const elements = this.getSelectedElements(frameId);
    if (!elements) return;
    extendToIncludeEdges(elements, this.getElements());
    copyToClipboard(elements);
  }

  // paste from the internal buffer.
  // If nextTo is given, paste next to the elements in nextTo,
  // e.g., this is used to implemented "duplicate"; otherwise,
  // pastes to the center of the viewport.
  paste(
    frameId?: string,
    _value?: string | true | undefined,
    nextTo?: Element[],
  ): void {
    if (frameId && this._get_frame_type(frameId) != this.mainFrameType) return;
    const pastedElements = pasteFromInternalClipboard();
    let target: Point = { x: 0, y: 0 };
    if (nextTo != null) {
      const { x, y, w, h } = rectSpan(nextTo);
      const w2 = rectSpan(pastedElements).w;
      target = { x: x + w + w2 / 2 + DEFAULT_GAP, y: y + h / 2 };
    } else if (frameId != null) {
      const viewport = this._get_frame_node(frameId)?.get("viewport")?.toJS();
      if (viewport != null) {
        target = centerOfRect(viewport);
      }
    }
    const ids = this.insertElements(frameId, pastedElements, target);
    if (frameId != null) {
      this.setSelectionMulti(frameId, ids);
    }
  }

  scrollElementIntoView(
    id: string,
    frameId: string | undefined = undefined,
    loc: "center" | "top" = "top",
  ) {
    const element = this.getElement(id);
    if (element == null) return;
    frameId = frameId ?? this.show_focused_frame_of_type(this.mainFrameType);
    if (frameId == null) return;
    this.setPageId(frameId, element.page ?? this.defaultPageId());
    let center;
    if (loc == "center") {
      center = centerOfRect(element);
    } else {
      const node = this._get_frame_node(frameId);
      const viewport = node?.get("viewport")?.toJS();
      if (viewport == null) return;
      const top = topOfRect(element);
      center = { x: top.x, y: top.y + viewport.h / 2 - viewport.h / 10 };
    }
    this.setViewportCenter(frameId, center);
    setTimeout(() => {
      if (frameId != null) {
        // just for typescript
        this.setViewportCenter(frameId, center);
      }
    }, 1);
  }

  gotoUser(account_id: string, frameId?: string) {
    const cursors = this._syncstring.get_cursors({
      maxAge: 0,
      excludeSelf: "never",
    });
    const info = cursors.get(account_id);
    if (info == null) return; // no info
    const locs = info.get("locs");
    if (locs == null) return; // no info
    for (const loc of locs) {
      const id = loc.get("id");
      if (typeof id === "string") {
        this.scrollElementIntoView(id, frameId);
        return;
      }
    }
  }

  // Hide given elements
  hideElements(
    elements: Element[],
    commit: boolean = true,
    frame: string = "",
  ): void {
    if (elements.length == 0) return;
    for (const element of elements) {
      const { id, w, h, type } = element;
      if (frame) {
        // hiding as part of a frame; se set hide to record the frame,
        // but do NOT change or save the w,h, since they won't be used, since
        // this element will never be rendered.
        this.setElement({
          obj: { id, hide: { frame } },
          commit: false,
          cursors: [{}],
        });
      } else if (type == "frame") {
        // hiding a frame
        this.setElement({
          obj: { id, hide: { w, h }, w: 30, h: 30 },
          commit: false,
          cursors: [{}],
        });
        // hiding a frame, so also hide all of the objects that intersect
        // the frame, except the frame itself
        const contents = getOverlappingElements(
          this.getElements(),
          element,
        ).filter((element) => element.id != id);
        this.hideElements(contents, false, id);
      } else {
        // hiding a normal element.
        this.setElement({
          obj: { id, hide: { w, h }, w: 30, h: 30 },
          commit: false,
          cursors: [{}],
        });
      }
    }
    if (commit) {
      this.syncstring_commit();
    }
  }

  // Show element with given id.  If you show a frame, then anything
  // hidden because it overlapped the frame is also shown.
  unhideElements(elements: Element[], commit: boolean = true): void {
    if (elements.length == 0) return;
    for (const element of elements) {
      if (element?.hide == null) continue;
      if (element.hide["frame"] != null) {
        const obj: Partial<Element> = { id: element.id, hide: null as any };
        if (element.hide.w != null) {
          // subtle case: when you hide something in a frame, then hide the
          // frame, then show that frame again....
          obj.hide = { w: element.hide.w, h: element.hide.h };
        }
        this.setElement({
          obj,
          commit: false,
          cursors: [{}],
        });
      } else {
        const { w, h } = element.hide as { w: number; h: number };
        this.setElement({
          obj: { id: element.id, hide: null as any, w, h },
          commit: false,
          cursors: [{}],
        });
      }
      if (element.type == "frame") {
        // unhiding a frame, so also unhide everything that was hidden
        // as part of hiding this frame.
        const v: Element[] = this.getElements().filter(
          (elt) => elt.hide?.["frame"] == element.id,
        );
        this.unhideElements(v, false);
      }
    }
    if (commit) {
      this.syncstring_commit();
    }
  }

  private isLocked(id: string): boolean {
    return !!this.store.getIn(["elements", id, "locked"]);
  }

  lockElements(elements: Element[]) {
    if (elements.length == 0) return;
    for (const element of elements) {
      this.setElement({
        obj: { id: element.id, locked: true },
        commit: false,
        cursors: [{}],
      });
    }
    this.syncstring_commit();
  }

  unlockElements(elements: Element[]) {
    if (elements.length == 0) return;
    for (const element of elements) {
      this.setElement({
        obj: { id: element.id, locked: null as any },
        commit: false,
        cursors: [{}],
      });
    }
    this.syncstring_commit();
  }

  moveElements(
    elements: (Element | string)[],
    offset: Point,
    commit: boolean = true,
    moved: Set<string> = new Set(),
  ): void {
    let allElements: undefined | Element[] = undefined;
    const tx = Math.round(offset.x);
    const ty = Math.round(offset.y);
    for (let element of elements) {
      if (typeof element == "string") {
        const x = this.idToElement(element);
        if (x == null) continue;
        element = x;
      }
      if (typeof element == "string") throw Error("bug");
      const { id } = element;
      if (moved.has(id)) continue;
      const x = element.x + tx;
      const y = element.y + ty;
      this.setElement({
        obj: { id, x, y },
        commit: false,
        cursors: [{}],
      });
      moved.add(id);
      if (element.type == "frame") {
        // also move any element/group that are part of the frame.  That's what
        // makes frames special.  (Except don't move other frames, or that
        // would make it impossible to separate them.)
        if (allElements == null) allElements = this.getElements();
        let overlapping: Element[];
        if (element.hide != null) {
          overlapping = allElements.filter((elt) => elt.hide?.["frame"] == id);
        } else {
          overlapping = getOverlappingElements(allElements, element).filter(
            (elt) => elt.type != "frame",
          );
        }
        this.moveElements(overlapping, offset, false, moved);
      }
      if (element.group) {
        // also have to move the rest of the group
        this.moveElements(this.getGroup(element.group), offset, false, moved);
      }
    }
    if (commit) {
      this.syncstring_commit();
    }
  }

  // For duplicateElements, it's critical to take into account the frameId, so the
  // paste below is into the same page as where the element was copied. Otherwise,
  // the elements all end up on page 1.
  duplicateElements(elements: Element[], frameId: string) {
    const elements0 = [...elements];
    extendToIncludeEdges(elements0, this.getElements());
    copyToClipboard(elements0);
    this.paste(frameId, undefined, elements);
  }

  getGroup(group: string): Element[] {
    const X: Element[] = [];
    if (!group) return X;
    const elementsMap = this.store.get("elements");
    if (!elementsMap) return X;
    for (const [_, element] of elementsMap) {
      if (element?.get("group") == group) {
        X.push(element.toJS());
      }
    }
    return X;
  }

  enableWhiteboardKeyHandler(frameId: string) {
    this.keyHandler = getKeyHandler(this, frameId);
    this.set_active_key_handler(this.keyHandler);
  }

  disableWhiteboardKeyHandler() {
    if (this.keyHandler != null) {
      this.erase_active_key_handler(this.keyHandler);
      delete this.keyHandler;
    }
  }

  hide() {
    this.disableWhiteboardKeyHandler();
  }

  focus(id?: string): void {
    if (id === undefined) {
      id = this._get_active_id();
    }
    const node = this._get_frame_node(id);
    const type = node?.get("type");
    if (
      type == this.mainFrameType ||
      type == "slideshow" // might change shortcuts for slideshow?
    ) {
      this.enableWhiteboardKeyHandler(id);
    } else {
      this.disableWhiteboardKeyHandler();
    }
    super.focus(id);
  }

  increase_font_size(id: string): void {
    this.set_font_size(
      id,
      (this._get_frame_node(id)?.get("font_size") ?? DEFAULT_FONT_SIZE) + 1,
    );
  }

  decrease_font_size(id: string): void {
    this.set_font_size(
      id,
      (this._get_frame_node(id)?.get("font_size") ?? DEFAULT_FONT_SIZE) - 1,
    );
  }

  set_font_size(id: string, font_size: number): void {
    font_size = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, font_size));
    this.set_frame_tree({ id, font_size });
  }

  setEditFocus(id: string, editFocus: boolean): void {
    this.set_frame_tree({ id, editFocus });
  }

  // this is useful for context panels, e.g., Jupyter
  selectionContainsCellOfType(frameId: string, type: ElementType): boolean {
    const selection = this._get_frame_node(frameId)?.get("selection");
    if (!selection) return false;
    const elements = this.store.get("elements");
    if (elements == null) return false;
    for (const id of selection) {
      if (elements.getIn([id, "type"]) == type) {
        return true;
      }
    }
    return false;
  }

  // Set the current search string
  setSearch(id: string, search: string): void {
    this.set_frame_tree({ id, search });
  }

  async programmatically_goto_line(
    line: string | number,
    _cursor?: boolean,
    _focus?: boolean,
    frameId?: string, // if given scroll this particular frame
  ) {
    // NOTE: This function is a bit different in that it is often called before
    // the sync stuff is initialized. So unlike most functions above, we
    // have to be explicit about that.
    if (!(await this.wait_until_syncdoc_ready())) {
      return;
    }
    if (frameId == null) {
      frameId = this.show_focused_frame_of_type(this.mainFrameType);
    }

    const elementId = `${line}`;
    this.scrollElementIntoView(elementId, frameId);
    this.zoom100(frameId);
  }

  async gotoFragment(fragmentId: FragmentId) {
    if (fragmentId.chat) {
      // deal with side chat in base class
      await super.gotoFragment(fragmentId);
    }
    // console.log("gotoFragment ", fragmentId);
    const frameId = await this.waitUntilFrameReady({
      type: this.mainFrameType,
    });
    if (!frameId) return;
    const { id, page } = fragmentId as any;
    if (page != null) {
      if (page.length <= 4) {
        // id's are length 8 so if <= 4 characters then it is
        // very likely an older page number.  We want these links
        // to still work.
        this.setPage(frameId, page);
      } else {
        // new page id's:
        this.setPageId(frameId, page);
      }
      return;
    }
    if (id != null) {
      this.scrollElementIntoView(id, frameId);
      return;
    }
  }

  public async show_table_of_contents(
    _id: string | undefined = undefined,
  ): Promise<void> {
    const id = this.show_focused_frame_of_type(
      "table_of_contents",
      "col",
      true,
      0.2,
    );
    await delay(0);
    if (this._state === "closed") return;
    this.set_active_id(id, true);
  }

  public updateTableOfContents(force: boolean = false): void {
    if (this._state == "closed" || this._syncstring == null) {
      // no need since not initialized yet or already closed.
      return;
    }
    if (
      !force &&
      !this.get_matching_frame({ type: "whiteboard_table_of_contents" })
    ) {
      // There is no table of contents frame so don't update that info.
      return;
    }
    const elements = this.store.get("elements");
    if (elements == null) return;

    const contents = fromJS(
      parseTableOfContents(elements, this.store.get("sortedPageIds")),
    ) as any;
    this.setState({ contents });
  }

  public async scrollToHeading(entry: TableOfContentsEntry): Promise<void> {
    this.gotoFragment({ id: entry.id.split("-")[1] });
  }

  help(): void {
    open_new_tab("https://doc.cocalc.com/whiteboard.html");
  }

  defaultPageId(): string {
    return this.numberToPageId(0);
  }

  // TODO: no attempt at caching yet, so not efficient...
  // To cache, probably just put in _init2() above.
  sortedPageIds(): SortedPageList {
    return this.store.get("sortedPageIds") ?? fromJS([]);
  }

  // returns page number corresponding to an id; if the id is not known,
  // this just returns null
  pageToNumber(page: string): number | null {
    const n = this.sortedPageIds().indexOf(page);
    return n == -1 ? null : n + 1;
  }

  numberToPageId(pageNumber: number): string {
    const pages = this.sortedPageIds();
    // page numbers are 1-based, hence the "-1":
    const id = pages.get(pageNumber - 1);
    if (id) {
      return id;
    }
    if (pages.size > 0) {
      return pages.get(0) ?? "";
    }
    return this.createPage();
  }

  setPageId(frameId: string, pageId: string): void {
    const node = this._get_frame_node(frameId);
    if (node == null) return;
    this.setPage(frameId, this.pageToNumber(pageId) ?? 1);
    this.setFragmentIdToPage(frameId);
  }

  newPage(
    frameId: string,
    afterPageId: string = "",
    commit: boolean = true,
  ): string {
    const n = this.store.get("pages")?.size ?? 1;
    const page = this.createPage(false);
    this.setPages(frameId, n + 1);
    this.setPageId(frameId, page);
    if (afterPageId) {
      const pages = this.sortedPageIds();
      const cur = pages.indexOf(afterPageId);
      const elements = this.store.get("elements");
      if (cur >= 0 && elements != null) {
        // Complexity: we don't just move the newly inserted page by calling
        // movePage, since the store isn't updated yet (that only happens in
        // response to commit), and movePage works on what is in the store.
        const curPos = elements.getIn([
          pages.get(cur) ?? "",
          "data",
          "pos",
        ]) as number;
        const nextPos = elements.getIn([
          pages.get(cur + 1) ?? "",
          "data",
          "pos",
        ]) as number | undefined;
        const pos = nextPos == null ? curPos + 1 : (curPos + nextPos) / 2;
        this.setElement({
          create: false,
          obj: { id: page, data: { pos } },
          commit: false,
        });
      }
    }
    if (commit) {
      this.syncstring_commit();
      if (afterPageId) {
        this.ensurePagePositionsAreDistinct();
      }
    }
    return page;
  }

  // returns id of the new page
  createPage(commit: boolean = true): string {
    const id = this.createId();
    // create pos that is 1 larger than all current pos's
    let pos = 0;
    for (const [id] of this.store.get("pages") ?? []) {
      let pos1 = this.store.getIn(["elements", id, "data", "pos"], 0);
      if (pos <= pos1) {
        pos = pos1 + 1;
      }
    }
    this.setElement({
      create: true,
      obj: { type: "page", id, z: 0, data: { pos } },
      commit,
    });
    return id;
  }

  movePage(oldIndex: number, newIndex: number, commit: boolean = true): void {
    // move the page in position oldIndex to be in position newIndex
    const pages = this.sortedPageIds();
    const pos = moveCell({
      oldIndex,
      newIndex,
      size: pages.size,
      getPos: (index) =>
        this.store.getIn(
          ["elements", pages.get(index) ?? "", "data", "pos"],
          0,
        ),
    });
    this.setElement({
      obj: { id: pages.get(oldIndex), data: { pos } },
      commit,
    });
    if (commit) {
      this.ensurePagePositionsAreDistinct();
    }
  }

  // Ensure that the the page pos's aren't too close.  This could happen if
  // the above movePage function hit the "averaging" case a large number of time,
  // e.g., by a user fiddling, and then averaging runs out of precision.
  // I don't know where this random seeming epsilon came from.
  private ensurePagePositionsAreDistinct(epsilon = 0.0000000001): void {
    const elements = this.store.get("elements");
    if (elements == null) return;
    const sortedPageIds = this.store.get("sortedPageIds");
    if (sortedPageIds == null) return;
    const positions = sortedPageIds.map((pageId) =>
      elements.getIn([pageId, "data", "pos"]),
    ) as any;
    let tooClose = false;
    for (let i = 1; i < positions.size; i++) {
      if (positions.get(i) - positions.get(i - 1) < epsilon) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) return;
    // Just space them out as distinct integers; don't try to be too clever,
    // since this is rare.
    for (let pos = 0; pos < sortedPageIds.size; pos++) {
      this.setElement({
        obj: { id: sortedPageIds.get(pos), data: { pos } },
        commit: pos == sortedPageIds.size - 1,
      });
    }
  }

  // delete page with given id along with everything that
  // is one that page.
  deletePage(pageId: string, commit: boolean = true): void {
    const page = this.store.getIn(["pages", pageId]);
    if (page == null) return;
    this.deleteElements(Object.values(page.toJS() as any), false);
    this.delete(pageId, commit);
  }

  languageModelExtraFileInfo() {
    return "Whiteboard/Markdown";
  }

  languageModelGetText(frameId: string, scope): string {
    const elts = this.store.get("elements")?.toJS() as any;
    if (elts == null) {
      return "";
    }
    const elements = Object.values(elts) as Element[];
    if (scope == "all") {
      return toMarkdown(elements);
    }
    const node = this._get_frame_node(frameId);
    if (node == null) return "";
    if (scope == "page") {
      // get the page of frameId
      const page = node.get("page");
      const pageId = this.store.getIn(["sortedPageIds", page - 1]) ?? "";
      return toMarkdown(
        elements.filter(
          (element) => element.page == pageId || element.type == "page",
        ),
      );
    } else if (scope == "selection") {
      const selection = node.get("selection");
      if (selection == null) {
        return "";
      }
      return selection.map((id) => elementToMarkdown(elts[id])).join("\n");
    }
    return "";
  }

  languageModelGetScopes() {
    return new Set<"selection" | "page">(["selection", "page"]);
  }

  languageModelGetLanguage() {
    return "md";
  }
}

export function elementsList(
  elements?: ImmutableMap<string, any>,
): Element[] | undefined {
  return elements
    ?.valueSeq()
    .filter((x) => x != null)
    .toJS();
}

// Mutate selected to also include
// any edges in elements that are between
// two elements of selected.
export function extendToIncludeEdges(
  selection: Element[],
  elements: Element[],
) {
  const vertices = new Set(selection.map((element) => element.id));
  for (const element of elements) {
    if (element.type == "edge" && element.data != null) {
      const { from, to } = element.data;
      if (from == null || to == null) continue;
      if (vertices.has(from) && vertices.has(to) && !vertices.has(element.id)) {
        selection.push(element);
      }
    }
  }
}
