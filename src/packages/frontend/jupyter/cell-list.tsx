/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// React component that renders the ordered list of cells

declare const $: any;

import { MutableRefObject, useEffect, useCallback, useMemo } from "react";
import { debounce } from "lodash";
import { delay } from "awaiting";
import * as immutable from "immutable";
import { React, useIsMountedRef, useRef } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { Cell } from "./cell";
import { InsertCell } from "./insert-cell";
import { JupyterActions } from "./browser-actions";
import { NotebookMode, Scroll } from "./types";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";

import { createContext, useContext } from "react";
interface IFrameContextType {
  iframeDivRef?: MutableRefObject<any>;
  iframeOnScrolls?: { [key: string]: () => void };
}
const IFrameContext = createContext<IFrameContextType>({});
export const useIFrameContext: () => IFrameContextType = () => {
  return useContext(IFrameContext);
};

interface CellListProps {
  actions?: JupyterActions; // if not defined, then everything read only
  name?: string;
  cell_list: immutable.List<string>; // list of ids of cells in order
  cells: immutable.Map<string, any>;
  font_size: number;
  sel_ids?: immutable.Set<string>; // set of selected cells
  md_edit_ids?: immutable.Set<string>;
  cur_id?: string; // cell with the green cursor around it; i.e., the cursor cell
  mode: NotebookMode;
  hook_offset?: number;
  scroll?: Scroll; // scroll by this amount
  cm_options: immutable.Map<string, any>;
  project_id?: string;
  directory?: string;
  scrollTop?: any;
  complete?: immutable.Map<string, any>; // status of tab completion
  is_focused?: boolean;
  more_output?: immutable.Map<string, any>;
  cell_toolbar?: string;
  trust?: boolean;
  use_windowed_list?: boolean;
}

export const CellList: React.FC<CellListProps> = (props: CellListProps) => {
  const {
    actions,
    name,
    cell_list,
    cells,
    font_size,
    sel_ids,
    md_edit_ids,
    cur_id,
    mode,
    hook_offset,
    scroll,
    cm_options,
    project_id,
    directory,
    scrollTop,
    complete,
    is_focused,
    more_output,
    cell_toolbar,
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
    } else {
      if (cell_list_node.current != null) {
        frameActions.current?.set_scrollTop(cell_list_node.current.scrollTop);
      }
    }
  }

  async function restore_scroll(): Promise<void> {
    if (scrollTop == null) return;
    /* restore scroll state -- as rendering happens dynamically
       and asynchronously, and I have no idea how to know when
       we are done, we can't just do this once.  Instead, we
       keep resetting scrollTop a few times.
    */
    let scrollHeight: number = 0;
    for (const tm of [0, 1, 100, 250, 500, 1000]) {
      if (!is_mounted.current) return;
      if (!use_windowed_list) {
        const elt = cell_list_node.current;
        if (elt != null && elt.scrollHeight !== scrollHeight) {
          // dynamically rendering actually changed something
          elt.scrollTop = scrollTop;
          scrollHeight = elt.scrollHeight;
        }
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
      if (scroll == "cell visible") {
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
      const cellList = actions?.store.get("cell_list");
      const index = cellList?.indexOf(cur_id);
      if (index == null) return;
      if (scroll == "cell visible") {
        virtuosoRef.current?.scrollIntoView({ index: index + 1 });
      } else if (scroll == "cell top") {
        virtuosoRef.current?.scrollToIndex({ index: index + 1 });
      }
    } else if (scroll.startsWith("list")) {
      if (scroll == "list up") {
        const index = virtuosoRangeRef.current?.startIndex;
        virtuosoRef.current?.scrollToIndex({ index: index + 1, align: "end" });
      } else if (scroll == "list down") {
        const index = virtuosoRangeRef.current?.endIndex;
        virtuosoRef.current?.scrollToIndex({
          index: index + 1,
          align: "start",
        });
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
    isScrolling: boolean,
    index: number,
    delayRendering?: number
  ) {
    const cell = cells.get(id);
    if (cell == null) return null;
    return (
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
              id: cellListRef.current?.get(scrollState.index - 1),
            };
            setTimeout(() => {
              frameActions.current?.set_scrollTop(scrollState);
            }, 0);
            for (const key in iframeOnScrolls) {
              iframeOnScrolls[key]();
            }
          },
          scrollerRef: handleCellListRef,
        }
      : { disabled: true }
  );

  useEffect(() => {
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
    // index + 1 because of iframe
    // the offset+1 is I think compensating for a bug maybe in virtuoso or our use of it.
    virtuosoRef.current?.scrollToIndex({
      index: index + 1,
      offset: offset + 1,
    });
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: index + 1,
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

  const iframeDivRef = useRef<any>(null);
  if (use_windowed_list) {
    return (
      <IFrameContext.Provider value={{ iframeDivRef, iframeOnScrolls }}>
        <Virtuoso
          ref={virtuosoRef}
          onClick={actions != null && complete != null ? on_click : undefined}
          topItemCount={1}
          style={{
            fontSize: `${font_size}px`,
            height: "100%",
            overflowX: "hidden",
          }}
          totalCount={
            cell_list.size + 1 /* +1 due to the iframe cell at the top */
          }
          itemContent={(index) => {
            if (index == 0) {
              return (
                <div
                  ref={iframeDivRef}
                  style={{
                    height: "1px",
                    overflow: "hidden",
                  }}
                >
                  iframes here
                </div>
              );
            }
            const key = cell_list.get(index - 1);
            if (key == null) return null;
            const is_last: boolean = key === cell_list.get(-1);
            return (
              <div style={{ overflow: "hidden" }}>
                {render_insert_cell(key, "above")}
                {render_cell(key, false, index - 1)}
                {is_last ? render_insert_cell(key, "below") : undefined}
              </div>
            );
          }}
          rangeChanged={(visibleRange) => {
            virtuosoRangeRef.current = visibleRange;
          }}
          {...virtuosoScroll}
        />
      </IFrameContext.Provider>
    );
  }

  // This is needed for **the share server**, which can't
  // do windowing and also for the non-windowed mode.
  function render_list_of_cells_directly() {
    const v: (JSX.Element | null)[] = [];
    let index: number = 0;
    cell_list.forEach((id: string) => {
      if (actions != null) {
        v.push(render_insert_cell(id));
      }
      v.push(render_cell(id, false, index, index));
      index += 1;
    });
    if (actions != null && v.length > 0) {
      const id = cell_list.get(cell_list.size - 1);
      if (id != null) {
        v.push(render_insert_cell(id, "below"));
      }
    }

    return v;
  }

  return (
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
      {render_list_of_cells_directly()}
    </div>
  );
};
