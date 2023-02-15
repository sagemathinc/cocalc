/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// React component that renders the ordered list of cells

declare const $: any;

import { delay } from "awaiting";
import * as immutable from "immutable";
import { debounce } from "lodash";
import {
  MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { useDebounce } from "use-debounce";

import { CSS, React, useIsMountedRef } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { FileContext, useFileContext } from "@cocalc/frontend/lib/file-context";
import { JupyterActions } from "./browser-actions";
import { Cell } from "./cell";
import HeadingTagComponent from "./heading-tag";
import { InsertCell } from "./insert-cell";
import { NotebookMode, Scroll } from "./types";

import {
  SortableList,
  SortableItem,
  DragHandle,
} from "@cocalc/frontend/components/sortable-list";

import { createContext, useContext } from "react";
interface IFrameContextType {
  iframeDivRef?: MutableRefObject<any>;
  iframeOnScrolls?: { [key: string]: () => void };
}
const IFrameContext = createContext<IFrameContextType>({});
export const useIFrameContext: () => IFrameContextType = () => {
  return useContext(IFrameContext);
};

// 3 extra cells:
//  - iframe cell  (hidden at top)
//  - style cell   (hidden at top)
//  - padding (at the bottom)
const EXTRA_TOP_CELLS = 2;
const EXTRA_BOTTOM_CELLS = 1;

// the extra bottom cell at the very end
// See https://github.com/sagemathinc/cocalc/issues/6141 for a discussion
// of why this.  It's the best I could come up with that was very simple
// to understand and a mix of other options.
const BOTTOM_PADDING_CELL = (
  <div style={{ height: "50vh", minHeight: "400px" }}></div>
);

const ITEM_STYLE: CSS = {
  height: "1px",
  overflow: "hidden",
};

interface CellListProps {
  actions?: JupyterActions; // if not defined, then everything is read only
  cell_list: immutable.List<string>; // list of ids of cells in order
  cell_toolbar?: string;
  cells: immutable.Map<string, any>;
  cm_options: immutable.Map<string, any>;
  complete?: immutable.Map<string, any>; // status of tab completion
  cur_id?: string; // cell with the green cursor around it; i.e., the cursor cell
  directory?: string;
  font_size: number;
  hook_offset?: number;
  is_focused?: boolean;
  md_edit_ids?: immutable.Set<string>;
  mode: NotebookMode;
  more_output?: immutable.Map<string, any>;
  name?: string;
  project_id?: string;
  scroll?: Scroll; // scroll by this amount
  scrollTop?: any;
  sel_ids?: immutable.Set<string>; // set of selected cells
  trust?: boolean;
  use_windowed_list?: boolean;
}

export const CellList: React.FC<CellListProps> = (props: CellListProps) => {
  const {
    actions,
    cell_list,
    cell_toolbar,
    cells,
    cm_options,
    complete,
    cur_id,
    directory,
    font_size,
    hook_offset,
    is_focused,
    md_edit_ids,
    mode,
    more_output,
    name,
    project_id,
    scroll,
    scrollTop,
    sel_ids,
    trust,
    use_windowed_list,
  } = props;
  const cell_list_node = useRef<HTMLElement | null>(null);
  const is_mounted = useIsMountedRef();
  const frameActions = useNotebookFrameActions();

  useEffect(() => {
    restore_scroll();
    const frame_actions = frameActions.current;
    if (frame_actions == null) return;
    // Enable keyboard handler if necessary
    if (is_focused) {
      frame_actions.enable_key_handler();
    }
    // Also since just mounted, set this to be focused.
    // When we have multiple editors on the same page, we will
    // have to set the focus at a higher level (in the project store?).
    frame_actions.focus(true);
    // setup a click handler so we can manage focus
    $(window).on("click", window_click);
    frame_actions.cell_list_div = $(cell_list_node.current);

    return () => {
      save_scroll();
      // handle focus via an event handler on window.
      // We have to do this since, e.g., codemirror editors
      // involve spans that aren't even children, etc...
      $(window).unbind("click", window_click);
      frameActions.current?.disable_key_handler();
    };
  }, []);

  useEffect(() => {
    // the focus state changed.
    if (is_focused) {
      frameActions.current?.enable_key_handler();
    } else {
      frameActions.current?.disable_key_handler();
    }
  }, [is_focused]);

  useEffect(() => {
    // scroll state changed
    if (scroll != null) {
      scroll_cell_list(scroll);
      frameActions.current?.scroll(); // reset scroll request state
    }
  }, [scroll]);

  const handleCellListRef = useCallback((node: any) => {
    cell_list_node.current = node;
    frameActions.current?.set_cell_list_div(node);
  }, []);

  if (cell_list == null) {
    return render_loading();
  }

  function save_scroll(): void {
    if (use_windowed_list) {
      // TODO -- virtuoso
      // We don't actually need to do anything though since our virtuoso
      // integration automatically solves this same problem.
    } else {
      if (cell_list_node.current != null) {
        frameActions.current?.set_scrollTop(cell_list_node.current.scrollTop);
      }
    }
  }

  async function restore_scroll(): Promise<void> {
    if (scrollTop == null || use_windowed_list) return;
    /* restore scroll state -- as rendering happens dynamically
       and asynchronously, and I have no idea how to know when
       we are done, we can't just do this once.  Instead, we
       keep resetting scrollTop a few times.
    */
    let scrollHeight: number = 0;
    for (const tm of [0, 1, 100, 250, 500, 1000]) {
      if (!is_mounted.current) return;
      const elt = cell_list_node.current;
      if (elt != null && elt.scrollHeight !== scrollHeight) {
        // dynamically rendering actually changed something
        elt.scrollTop = scrollTop;
        scrollHeight = elt.scrollHeight;
      }
      await delay(tm);
    }
  }

  function window_click(event: any): void {
    // if click in the cell list, focus the cell list; otherwise, blur it.
    const elt = $(cell_list_node.current);
    // list no longer exists, nothing left to do
    // Maybe elt can be null? https://github.com/sagemathinc/cocalc/issues/3580
    if (elt.length == 0) return;

    const offset = elt.offset();
    if (offset == null) {
      // offset can definitely be null -- https://github.com/sagemathinc/cocalc/issues/3580
      return;
    }

    const x = event.pageX - offset.left;
    const y = event.pageY - offset.top;
    const outerH = elt.outerHeight();
    const outerW = elt.outerWidth();
    if (outerW != null && outerH != null) {
      if (x >= 0 && y >= 0 && x <= outerW && y <= outerH) {
        frameActions.current?.focus();
      } else {
        frameActions.current?.blur();
      }
    }
  }

  async function scroll_cell_list_not_windowed(scroll: Scroll): Promise<void> {
    const node = $(cell_list_node.current);
    if (node.length == 0) return;
    if (typeof scroll === "number") {
      node.scrollTop(node.scrollTop() + scroll);
      return;
    }

    // supported scroll positions are in types.ts
    if (scroll.startsWith("cell ")) {
      // Handle "cell visible" and "cell top"
      const cell = $(node).find(`#${cur_id}`);
      if (cell.length == 0) return;
      if (scroll.startsWith("cell visible")) {
        cell.scrollintoview();
      } else if (scroll == "cell top") {
        // Make it so the top of the cell is at the top of
        // the visible area.
        const s = cell.offset().top - node.offset().top;
        node.scrollTop(node.scrollTop() + s);
      }
      return;
    }

    switch (scroll) {
      case "list up":
        // move scroll position of list up one page
        node.scrollTop(node.scrollTop() - node.height() * 0.9);
        break;
      case "list down":
        // move scroll position of list up one page
        node.scrollTop(node.scrollTop() + node.height() * 0.9);
        break;
    }
  }

  function scrollCellListVirtuoso(scroll: Scroll) {
    // NOTE: below we add one to the index to compensate
    // for the first fixed hidden cell that contains all
    // of the output iframes!
    if (typeof scroll == "number") {
      // scroll to a number is not meaningful for virtuoso; it might
      // be requested maybe (?) due to scroll restore and switching
      // between windowed and non-windowed mode.
      return;
    }

    if (scroll.startsWith("cell")) {
      // find index of cur_id cell.
      if (cur_id == null) return;
      const cellList = actions?.store.get("cell_list");
      const index = cellList?.indexOf(cur_id);
      if (index == null) return;
      if (scroll == "cell visible force") {
        virtuosoRef.current?.scrollIntoView({
          index: index + EXTRA_TOP_CELLS,
        });
      } else if (scroll == "cell visible") {
        // We ONLY scroll if the cell is not in the visible
        // range -- otherwise if the cell is halfway off the screen...
        // TODO: this is really just a stupid hack that doesn't fully work,
        // and I will have to implement something better.
        const n = index + EXTRA_TOP_CELLS;
        if (
          n < virtuosoRangeRef.current.startIndex ||
          n > virtuosoRangeRef.current.endIndex
        ) {
          virtuosoRef.current?.scrollIntoView({
            index: n,
          });
          // don't do the requestAnimationFrame hack as below here
          // because that actually moves between top and bottom.
        }
      } else if (scroll == "cell top") {
        virtuosoRef.current?.scrollToIndex({
          index: index + EXTRA_TOP_CELLS,
        });
        // hack which seems necessary for jupyter at least.
        requestAnimationFrame(() =>
          virtuosoRef.current?.scrollToIndex({
            index: index + EXTRA_TOP_CELLS,
          })
        );
      }
    } else if (scroll.startsWith("list")) {
      if (scroll == "list up") {
        const index = virtuosoRangeRef.current?.startIndex;
        virtuosoRef.current?.scrollToIndex({
          index: index + EXTRA_TOP_CELLS,
          align: "end",
        });
        requestAnimationFrame(() =>
          virtuosoRef.current?.scrollToIndex({
            index: index + EXTRA_TOP_CELLS,
            align: "end",
          })
        );
      } else if (scroll == "list down") {
        const index = virtuosoRangeRef.current?.endIndex;
        virtuosoRef.current?.scrollToIndex({
          index: index + EXTRA_TOP_CELLS,
          align: "start",
        });
        requestAnimationFrame(() =>
          virtuosoRef.current?.scrollToIndex({
            index: index + EXTRA_TOP_CELLS,
            align: "start",
          })
        );
      }
    }
  }

  async function scroll_cell_list(scroll: Scroll): Promise<void> {
    if (use_windowed_list) {
      scrollCellListVirtuoso(scroll);
    } else {
      // scroll not using windowed list
      scroll_cell_list_not_windowed(scroll);
      return;
    }
  }

  function render_loading() {
    return (
      <div
        style={{
          fontSize: "32pt",
          color: "#888",
          textAlign: "center",
          marginTop: "15px",
        }}
      >
        <Loading />
      </div>
    );
  }

  function on_click(e): void {
    if (actions) actions.clear_complete();
    if ($(e.target).hasClass("cocalc-complete")) {
      // Bootstrap simulates a click even when user presses escape; can't catch there.
      // See the complete component in codemirror-static.
      frameActions.current?.set_mode("edit");
    }
  }

  function render_insert_cell(
    id: string,
    position: "above" | "below" = "above"
  ): JSX.Element | null {
    if (actions == null) return null;
    return (
      <InsertCell
        id={id}
        key={id + "insert" + position}
        position={position}
        actions={actions}
      />
    );
  }

  function render_cell(
    id: string,
    isScrolling?: boolean,
    index?: number,
    delayRendering?: number
  ) {
    const cell = cells.get(id);
    if (cell == null) return null;
    if (index == null) {
      index = cell_list.indexOf(id) ?? 0;
    }
    return (
      <div>
        {actions?.store.is_cell_editable(id) && (
          <div style={{ position: "relative", zIndex: 1 }}>
            <DragHandle
              id={id}
              style={{
                position: "absolute",
                left: 15,
                top: 2.5,
                color: "#aaa",
              }}
            />
          </div>
        )}
        <Cell
          key={id}
          id={id}
          index={index}
          actions={actions}
          name={name}
          cm_options={cm_options}
          cell={cell}
          is_current={id === cur_id}
          hook_offset={hook_offset}
          is_selected={sel_ids?.contains(id)}
          is_markdown_edit={md_edit_ids?.contains(id)}
          mode={mode}
          font_size={font_size}
          project_id={project_id}
          directory={directory}
          complete={complete}
          is_focused={is_focused}
          more_output={more_output?.get(id)}
          cell_toolbar={cell_toolbar}
          trust={trust}
          is_scrolling={isScrolling}
          delayRendering={delayRendering}
        />
      </div>
    );
  }

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const virtuosoRangeRef = useRef<{ startIndex: number; endIndex: number }>({
    startIndex: 0,
    endIndex: 0,
  });
  const lastScrollStateRef = useRef<{
    id?: string;
    index: number;
    offset: number;
  }>({
    index: 0,
    offset: 0,
    id: "",
  });

  const cellListRef = useRef<any>(cell_list);
  cellListRef.current = cell_list;
  const virtuosoScroll = useVirtuosoScrollHook(
    use_windowed_list
      ? {
          initialState: scrollTop?.toJS?.(),
          cacheId:
            name != null && frameActions.current != null
              ? `${name}${frameActions.current?.frame_id}`
              : undefined,
          onScroll: (scrollState) => {
            lastScrollStateRef.current = {
              ...scrollState,
              id: cellListRef.current?.get(scrollState.index - EXTRA_TOP_CELLS),
            };
            for (const key in iframeOnScrolls) {
              iframeOnScrolls[key]();
            }
          },
          scrollerRef: handleCellListRef,
        }
      : { disabled: true }
  );

  useLayoutEffect(() => {
    if (!use_windowed_list) return;
    if (lastScrollStateRef.current == null) {
      return;
    }
    const { offset, id } = lastScrollStateRef.current;
    if (!id) {
      return;
    }
    const index = cellListRef.current?.indexOf(id);
    if (index == null) {
      return;
    }
    // index + EXTRA_TOP_CELLS because of iframe and style cells
    // the offset+1 is I think compensating for a bug maybe in
    // virtuoso or our use of it.
    virtuosoRef.current?.scrollToIndex({
      index: index + EXTRA_TOP_CELLS,
      offset: offset + 1,
    });
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: index + EXTRA_TOP_CELLS,
        offset: offset + 1,
      });
    });
  }, [cell_list]);

  const iframeOnScrolls = useMemo(() => {
    return {};
  }, []);
  useEffect(() => {
    if (!use_windowed_list) return;
    for (const key in iframeOnScrolls) {
      iframeOnScrolls[key]();
    }
  }, [cells]);

  // allStyles -- the CSS in <style> blocks in text/html outputs
  // of all cells.  We gather this and place it in a special cell
  // at the top, since that such css doesn't disappear when the cells
  // that produced it are scrolled off the screen. See
  //    https://github.com/sagemathinc/cocalc/issues/5943
  // We only update allStyles with a debounce of 1s, since it
  // can be time consuming as it involves a scan of the entire notebook.
  const [debouncedCells] = useDebounce(cells, 1000);
  const allStyles = useMemo(() => {
    if (!use_windowed_list) return "";
    let value = "";
    cell_list.forEach((id) => {
      debouncedCells.getIn([id, "output"])?.forEach((output) => {
        const html = output.getIn(["data", "text/html"]);
        if (html?.includes("style")) {
          // parse out and include style tags
          for (const x of $("<div>" + html + "</div>").find("style")) {
            value += x.innerHTML.trim() + "\n\n";
          }
        }
      });
    });
    return value;
  }, [debouncedCells, use_windowed_list]);

  const fileContext = useFileContext();

  let body;

  const iframeDivRef = useRef<HTMLDivElement>(null);
  const virtuosoHeightsRef = useRef<{ [index: number]: number }>({});
  if (use_windowed_list) {
    body = (
      <IFrameContext.Provider value={{ iframeDivRef, iframeOnScrolls }}>
        <Virtuoso
          ref={virtuosoRef}
          onClick={actions != null && complete != null ? on_click : undefined}
          topItemCount={EXTRA_TOP_CELLS}
          style={{
            fontSize: `${font_size}px`,
            height: "100%",
            overflowX: "hidden",
          }}
          totalCount={
            cell_list.size +
            EXTRA_TOP_CELLS /* +EXTRA_TOP_CELLS due to the iframe cell and style cell at the top */ +
            EXTRA_BOTTOM_CELLS
          }
          itemSize={(el) => {
            // We capture measured heights -- see big coment above the
            // the DivTempHeight component below for why this is needed
            // for Jupyter notebooks (but not most things).
            const h = el.getBoundingClientRect().height;
            // WARNING: This uses perhaps an internal implementation detail of
            //  virtuoso, which I hope they don't change, which is that the index of
            // the elements whose height we're measuring is in the data-item-index
            // attribute.
            const data = el.getAttribute("data-item-index");
            if (data != null) {
              const index = parseInt(data);
              virtuosoHeightsRef.current[index] = h;
            }
            return h;
          }}
          itemContent={(index) => {
            if (index == 0) {
              return (
                <div ref={iframeDivRef} style={ITEM_STYLE}>
                  iframes here
                </div>
              );
            } else if (index == 1) {
              return (
                <div ref={iframeDivRef} style={ITEM_STYLE}>
                  <style>{allStyles}</style>
                </div>
              );
            } else if (index == cell_list.size + EXTRA_TOP_CELLS) {
              return BOTTOM_PADDING_CELL;
            }
            const id = cell_list.get(index - EXTRA_TOP_CELLS);
            if (id == null) return null;
            const is_last: boolean = id === cell_list.get(-1);
            const h = virtuosoHeightsRef.current[index];
            return (
              <SortableItem id={id}>
                <DivTempHeight height={h ? `${h}px` : undefined}>
                  {render_insert_cell(id, "above")}
                  {render_cell(id, false, index - EXTRA_TOP_CELLS)}
                  {is_last ? render_insert_cell(id, "below") : undefined}
                </DivTempHeight>
              </SortableItem>
            );
          }}
          rangeChanged={(visibleRange) => {
            virtuosoRangeRef.current = visibleRange;
          }}
          {...virtuosoScroll}
        />
      </IFrameContext.Provider>
    );
  } else {
    // This is needed for **the share server**, which hasn't had
    // windowing implemented/tested for yet and also for the
    // non-windowed mode, which we will always support as an option.
    const v: (JSX.Element | null)[] = [];
    let index: number = 0;
    cell_list.forEach((id: string) => {
      v.push(
        <SortableItem id={id}>
          {actions != null && render_insert_cell(id)}
          {render_cell(id, false, index, index)}
        </SortableItem>
      );
      index += 1;
    });
    if (actions != null && v.length > 0) {
      const id = cell_list.get(cell_list.size - 1);
      if (id != null) {
        v.push(render_insert_cell(id, "below"));
      }
    }
    v.push(BOTTOM_PADDING_CELL);

    body = (
      <div
        key="cells"
        className="smc-vfill"
        style={{
          fontSize: `${font_size}px`,
          paddingLeft: "5px",
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
        }}
        ref={handleCellListRef}
        onClick={actions != null && complete != null ? on_click : undefined}
        onScroll={debounce(() => {
          save_scroll();
        }, 3000)}
      >
        {v}
      </div>
    );
  }

  return (
    <FileContext.Provider
      value={{ ...fileContext, noSanitize: !!trust, HeadingTagComponent }}
    >
      <SortableList
        disabled={actions == null}
        items={cell_list.toJS()}
        Item={({ id }) => (
          <div
            style={{
              background: "white",
              boxShadow: "8px 8px 4px 4px #ccc",
            }}
          >
            {render_insert_cell(id, "above")}
            {render_cell(id)}
          </div>
        )}
        onDragStart={(id) => {
          frameActions.current?.set_cur_id(id);
        }}
        onDragStop={(oldIndex, newIndex) => {
          actions?.moveCell(oldIndex, newIndex);
          setTimeout(() => {
            frameActions.current?.scroll("cell visible");
          }, 0);
        }}
      >
        {body}
      </SortableList>
    </FileContext.Provider>
  );
};

/*
DivTempHeight:

This component renders a div with an specified height
then **after the render  is committed to the screen** immediately
removes the height style. This is needed because when codemirror
editors are getting rendered, they have small initially, then
full height only after the first render... and that causes
a major problem with virtuoso.  To reproduce without this:

1. Create a notebook whose first cell has a large amount of code,
so its spans several page, and with a couple more smaller cells.
2. Scroll the first one off the screen entirely.
3. Scroll back up -- as soon as the large cell scrolls into view
there's a horrible jump to the middle of it.  This is because
the big div is temporarily tiny, and virtuoso does NOT use
absolute positioning, and when the div gets big again, everything
gets pushed down.

The easiest hack to deal with this, seems to be to record
the last measured height, then set it for the initial render
of each item, then remove it.
*/
function DivTempHeight({ children, height }) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (divRef.current != null) {
      divRef.current.style.minHeight = "";
    }
  });

  const style: CSS = {
    overflow: "hidden",
    minHeight: height,
    paddingTop: "3px", // for the hover bar buttons in insert-cell.tsx, otherwise they're cut off
  };

  return (
    <div ref={divRef} style={style}>
      {children}
    </div>
  );
}
