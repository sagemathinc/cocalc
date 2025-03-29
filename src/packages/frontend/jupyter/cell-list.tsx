/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// React component that renders the ordered list of cells

declare const $: any;
import useResizeObserver from "use-resize-observer";
import { delay } from "awaiting";
import * as immutable from "immutable";
import { debounce } from "lodash";
import {
  MutableRefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { CSS, React, useIsMountedRef } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import {
  DragHandle,
  SortableItem,
  SortableList,
} from "@cocalc/frontend/components/sortable-list";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { FileContext, useFileContext } from "@cocalc/frontend/lib/file-context";
import { LLMTools, NotebookMode, Scroll } from "@cocalc/jupyter/types";
import { JupyterActions } from "./browser-actions";
import { Cell } from "./cell";
import HeadingTagComponent from "./heading-tag";

interface StableHtmlContextType {
  cellListDivRef?: MutableRefObject<any>;
  scrollOrResize?: { [key: string]: () => void };
}
const StableHtmlContext = createContext<StableHtmlContextType>({});
export const useStableHtmlContext: () => StableHtmlContextType = () => {
  return useContext(StableHtmlContext);
};

// 3 extra cells:
//  - iframe cell  (hidden at top)
//  - style cell   (hidden at top)
//  - padding (at the bottom)
const EXTRA_BOTTOM_CELLS = 1;

const CELL_VISIBLE_THRESH = 50;

// the extra bottom cell at the very end
// See https://github.com/sagemathinc/cocalc/issues/6141 for a discussion
// of why this.  It's the best I could come up with that was very simple
// to understand and a mix of other options.
const BOTTOM_PADDING_CELL = (
  <div
    key="bottom-padding"
    style={{ height: "50vh", minHeight: "400px" }}
  ></div>
);

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
  is_visible?: boolean;
  md_edit_ids?: immutable.Set<string>;
  mode: NotebookMode;
  more_output?: immutable.Map<string, any>;
  name?: string;
  project_id?: string;
  scroll?: Scroll; // scroll as described by this, e.g., cecll visible'
  scroll_seq?: number; // indicates
  scrollTop?: any;
  sel_ids?: immutable.Set<string>; // set of selected cells
  trust?: boolean;
  use_windowed_list?: boolean;
  llmTools?: LLMTools;
  computeServerId?: number;
  read_only?: boolean;
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
    is_visible,
    md_edit_ids,
    mode,
    more_output,
    name,
    project_id,
    scroll,
    scroll_seq,
    scrollTop,
    sel_ids,
    trust,
    use_windowed_list,
    llmTools,
    computeServerId,
    read_only,
  } = props;

  const cellListDivRef = useRef<any>(null);
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
    frame_actions.cell_list_div = $(cellListDivRef.current);

    return () => {
      saveScroll();
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

  const lastScrollSeqRef = useRef<number>(-1);
  useEffect(() => {
    if (scroll_seq == null) return;
    // scroll state may have changed
    if (scroll != null && lastScrollSeqRef.current < scroll_seq) {
      lastScrollSeqRef.current = scroll_seq;
      scroll_cell_list(scroll);
    }
  }, [cur_id, scroll, scroll_seq]);

  const handleCellListRef = useCallback((node: any) => {
    cellListDivRef.current = node;
    frameActions.current?.set_cell_list_div(node);
  }, []);

  if (cell_list == null) {
    return render_loading();
  }

  const saveScroll = useCallback(() => {
    if (use_windowed_list) {
      // TODO -- virtuoso
      // We don't actually need to do anything though since our virtuoso
      // integration automatically solves this same problem.
    } else {
      if (cellListDivRef.current != null) {
        frameActions.current?.set_scrollTop(cellListDivRef.current.scrollTop);
      }
    }
  }, [use_windowed_list]);

  const saveScrollDebounce = useMemo(() => {
    return debounce(saveScroll, 2000);
  }, [use_windowed_list]);

  const fileContext = useFileContext();

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
      const elt = cellListDivRef.current;
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
    const elt = $(cellListDivRef.current);
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

  async function scrollCellListNotWindowed(scroll: Scroll): Promise<void> {
    const node = $(cellListDivRef.current);
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
      if (scroll == "cell visible") {
        // We ONLY scroll if the cell is not in the visible, since
        // react-virtuoso's "scrollIntoView" aggressively scrolls, even
        // if the item is in view.
        const n = index;
        let isNotVisible = false;
        let align: "start" | "center" | "end" = "start";
        if (n < virtuosoRangeRef.current.startIndex) {
          // If not rendered at all then clearly it is NOT visible.
          align = "start";
          isNotVisible = true;
        } else if (n > virtuosoRangeRef.current.endIndex) {
          align = "end";
          isNotVisible = true;
        } else {
          const scroller = $(cellListDivRef.current);
          const cell = scroller.find(`#${cur_id}`);
          if (scroller[0] == null) return;
          if (cell[0] == null) return;
          const scrollerRect = scroller[0].getBoundingClientRect();
          const cellRect = cell[0].getBoundingClientRect();
          const cellTop = cellRect.y;
          const cellBottom = cellRect.y + cellRect.height;
          if (cellBottom <= scrollerRect.y + CELL_VISIBLE_THRESH) {
            // the cell is entirely above the visible window
            align = "start";
            isNotVisible = true;
          } else if (
            cellTop >=
            scrollerRect.y + scrollerRect.height - CELL_VISIBLE_THRESH
          ) {
            // cell is completely below the visible window.
            align = "end";
            isNotVisible = true;
          }
        }
        if (isNotVisible) {
          virtuosoRef.current?.scrollIntoView({
            index: n,
            align,
          });
          // don't do the requestAnimationFrame hack as below here
          // because that actually moves between top and bottom.
        }
      } else if (scroll == "cell top") {
        virtuosoRef.current?.scrollToIndex({
          index,
        });
        // hack which seems necessary for jupyter at least.
        requestAnimationFrame(() =>
          virtuosoRef.current?.scrollToIndex({
            index,
          }),
        );
      }
    } else if (scroll.startsWith("list")) {
      if (scroll == "list up") {
        const index = virtuosoRangeRef.current?.startIndex;
        virtuosoRef.current?.scrollToIndex({
          index,
          align: "end",
        });
        requestAnimationFrame(() =>
          virtuosoRef.current?.scrollToIndex({
            index,
            align: "end",
          }),
        );
      } else if (scroll == "list down") {
        const index = virtuosoRangeRef.current?.endIndex;
        virtuosoRef.current?.scrollToIndex({
          index,
          align: "start",
        });
        requestAnimationFrame(() =>
          virtuosoRef.current?.scrollToIndex({
            index,
            align: "start",
          }),
        );
      }
    }
  }

  async function scroll_cell_list(scroll: Scroll): Promise<void> {
    if (use_windowed_list) {
      scrollCellListVirtuoso(scroll);
    } else {
      // scroll not using windowed list
      scrollCellListNotWindowed(scroll);
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

  function renderCell({
    id,
    isScrolling,
    index,
    delayRendering, // seems not used anywhere!
    isFirst,
    isLast,
    isDragging,
  }: {
    id: string;
    isScrolling?: boolean;
    index?: number;
    delayRendering?: number;
    isFirst?: boolean;
    isLast?: boolean;
    isDragging?: boolean;
  }) {
    const cell = cells.get(id);
    if (cell == null) return null;
    if (index == null) {
      index = cell_list.indexOf(id) ?? 0;
    }
    const dragHandle = actions?.store.is_cell_editable(id) ? (
      <DragHandle
        id={id}
        style={{
          position: "relative",
          left: 0,
          top: 0,
          color: "#aaa",
        }}
      />
    ) : undefined;

    return (
      <div key={id}>
        <Cell
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
          is_visible={is_visible}
          more_output={more_output?.get(id)}
          cell_toolbar={cell_toolbar}
          trust={trust}
          is_scrolling={isScrolling}
          delayRendering={delayRendering}
          llmTools={llmTools}
          computeServerId={computeServerId}
          isFirst={isFirst}
          isLast={isLast}
          dragHandle={dragHandle}
          read_only={read_only}
          isDragging={isDragging}
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
              id: cellListRef.current?.get(scrollState.index),
            };
            for (const key in scrollOrResize) {
              scrollOrResize[key]();
            }
          },
          scrollerRef: handleCellListRef,
        }
      : { disabled: true },
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
    virtuosoRef.current?.scrollToIndex({
      index,
      offset: offset + 1,
    });
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index,
        offset: offset + 1,
      });
    });
  }, [cell_list]);

  const scrollOrResize = useMemo(() => {
    return {};
  }, []);
  const updateScrollOrResize = useCallback(() => {
    for (const key in scrollOrResize) {
      scrollOrResize[key]();
    }
  }, []);

  useEffect(updateScrollOrResize, [cells]);

  let body;

  const virtuosoHeightsRef = useRef<{ [index: number]: number }>({});

  const cellListResize = useResizeObserver({ ref: cellListDivRef });
  useEffect(() => {
    for (const key in scrollOrResize) {
      scrollOrResize[key]();
    }
  }, [cellListResize]);

  if (use_windowed_list) {
    body = (
      <StableHtmlContext.Provider value={{ cellListDivRef, scrollOrResize }}>
        <div ref={cellListDivRef} className="smc-vfill">
          <Virtuoso
            ref={virtuosoRef}
            onClick={actions != null && complete != null ? on_click : undefined}
            topItemCount={0}
            style={{
              fontSize: `${font_size}px`,
              flex: 1,
              overflowX: "hidden",
            }}
            totalCount={cell_list.size + EXTRA_BOTTOM_CELLS}
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
              if (index == cell_list.size) {
                return BOTTOM_PADDING_CELL;
              }
              const id = cell_list.get(index);
              if (id == null) return null;
              const h = virtuosoHeightsRef.current[index];
              if (actions == null) {
                return renderCell({
                  id,
                  isScrolling: false,
                  index,
                });
              }
              return (
                <SortableItem id={id} key={id}>
                  <DivTempHeight height={h ? `${h}px` : undefined}>
                    {renderCell({
                      id,
                      isScrolling: false,
                      index,
                      isFirst: id === cell_list.get(0),
                      isLast: id === cell_list.get(-1),
                    })}
                  </DivTempHeight>
                </SortableItem>
              );
            }}
            rangeChanged={(visibleRange) => {
              virtuosoRangeRef.current = visibleRange;
            }}
            {...virtuosoScroll}
          />
        </div>
      </StableHtmlContext.Provider>
    );
  } else {
    // This is needed for **the share server**, which hasn't had
    // windowing implemented/tested for yet and also for the
    // non-windowed mode, which we will always support as an option.
    const v: (JSX.Element | null)[] = [];
    let index: number = 0;
    let isFirst = true;
    cell_list.forEach((id: string) => {
      v.push(
        <SortableItem id={id} key={id}>
          {renderCell({
            id,
            isScrolling: false,
            index,
            isFirst,
            isLast: cell_list.get(-1) == id,
          })}
        </SortableItem>,
      );
      isFirst = false;
      index += 1;
    });
    v.push(BOTTOM_PADDING_CELL);

    body = (
      <StableHtmlContext.Provider value={{ cellListDivRef, scrollOrResize }}>
        <div
          key="cells"
          className="smc-vfill"
          style={{
            fontSize: `${font_size}px`,
            paddingLeft: "5px",
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
          }}
          ref={cellListDivRef}
          onClick={actions != null && complete != null ? on_click : undefined}
          onScroll={() => {
            updateScrollOrResize();
            saveScrollDebounce();
          }}
        >
          {v}
        </div>
      </StableHtmlContext.Provider>
    );
  }

  if (actions != null) {
    // only make sortable if not read only.
    body = (
      <SortableList
        disabled={actions == null}
        items={cell_list.toJS()}
        Item={({ id }) => (
          /* This is what is displayed when dragging the given cell. */
          <div
            style={{
              background: "white",
              boxShadow: "8px 8px 4px 4px #ccc",
              fontSize: `${font_size}px`,
            }}
          >
            {renderCell({ id, isDragging: true })}
          </div>
        )}
        onDragStart={(id) => {
          frameActions.current?.set_cur_id(id);
        }}
        onDragStop={(oldIndex, newIndex) => {
          const delta = newIndex - oldIndex;
          frameActions.current?.move_selected_cells(delta);
          setTimeout(() => {
            frameActions.current?.scroll("cell visible");
          }, 0);
          setTimeout(() => {
            frameActions.current?.scroll("cell visible");
          }, 50);
        }}
      >
        {body}
      </SortableList>
    );
  }

  return (
    <FileContext.Provider
      value={{ ...fileContext, noSanitize: !!trust, HeadingTagComponent }}
    >
      {body}
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
export function DivTempHeight({ children, height }) {
  const divRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (divRef.current != null) {
      divRef.current.style.minHeight = "";
    }
  });

  const style: CSS = {
    minHeight: height,
  };

  return (
    <div ref={divRef} style={style}>
      {children}
    </div>
  );
}
