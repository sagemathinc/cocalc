/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// React component that renders the ordered list of cells

declare const $: any;

import { debounce } from "lodash";

const DEFAULT_ROW_SIZE: number = 64;
const DEFAULT_WINDOWED_SIZE: number = 15;
const NON_WINDOWED_SIZE = 1000;

import { delay } from "awaiting";
import * as immutable from "immutable";

import { React, useIsMountedRef } from "../app-framework";
import { Loading, WindowedList } from "../r_misc";
import { Cell } from "./cell";
import { InsertCell } from "./insert-cell";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

import { NotebookMode, Scroll } from "./types";

interface CellListProps {
  actions?: JupyterActions; // if not defined, then everything read only
  frame_actions?: NotebookFrameActions;
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
  scrollTop?: number;
  complete?: immutable.Map<string, any>; // status of tab completion
  is_focused?: boolean;
  more_output?: immutable.Map<string, any>;
  cell_toolbar?: string;
  trust?: boolean;
  use_windowed_list?: boolean;
}

export const CellList: React.FC<CellListProps> = React.memo(
  (props: CellListProps) => {
    const {
      actions,
      frame_actions,
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
      /* NOTE: if the value of use_windowed_list *changes* while mounted,
     we don't re-render everything, which would be a mess and is not
     really a good idea... since the main use of windowing is to
     make the initial render fast.  If it is already rendered, why
     mess it up?
     (TODO: we are not using windowed list ever anyways...)
  */
      use_windowed_list: use_windowed_list_prop,
    } = props;

    const cell_list_node = React.useRef<HTMLElement | null>(null);
    const windowed_list_ref = React.useRef<WindowedList | null>(null);
    const is_mounted = useIsMountedRef();

    const use_windowed_list =
      !!use_windowed_list_prop && actions != null && frame_actions != null;

    if (use_windowed_list && frame_actions != null) {
      frame_actions.set_windowed_list_ref(windowed_list_ref.current);
    }

    React.useEffect(() => {
      restore_scroll();
      if (frame_actions != null) {
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
      }

      if (frame_actions != null) {
        frame_actions.cell_list_div = $(cell_list_node.current);
      }

      return () => {
        if (frame_actions != null) {
          save_scroll();
          // handle focus via an event handler on window.
          // We have to do this since, e.g., codemirror editors
          // involve spans that aren't even children, etc...
          $(window).unbind("click", window_click);
          frame_actions.disable_key_handler();
        }
      };
    }, []);

    React.useEffect(() => {
      if (frame_actions == null) return;
      // the focus state changed.
      if (is_focused) {
        frame_actions.enable_key_handler();
      } else {
        frame_actions.disable_key_handler();
      }
    }, [is_focused]);

    React.useEffect(() => {
      if (frame_actions == null) return;
      // scroll state changed
      if (scroll != null) {
        scroll_cell_list(scroll);
        frame_actions.scroll(); // reset scroll request state
      }
    }, [scroll]);

    function save_scroll(): void {
      if (frame_actions == null) return;
      if (use_windowed_list) {
        if (windowed_list_ref.current == null) return;
        const info = windowed_list_ref.current.get_scroll();
        if (info != null) {
          frame_actions.set_scrollTop(info.scrollOffset);
        }
      } else {
        if (cell_list_node.current != null) {
          frame_actions.set_scrollTop(cell_list_node.current.scrollTop);
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
        if (use_windowed_list) {
          if (windowed_list_ref.current != null) {
            windowed_list_ref.current.scrollToPosition(scrollTop);
          }
        } else {
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
      if (frame_actions == null) return;
      if ($(".in.modal").length) {
        // A bootstrap modal is currently opened, e.g., support page, etc.
        // so do not focus no matter what -- in fact, blur for sure.
        frame_actions.blur();
        return;
      }
      // if click in the cell list, focus the cell list; otherwise, blur it.
      const elt = $(cell_list_node.current);
      // list no longer exists, nothing left to do
      // Maybe elt can be null? https://github.com/sagemathinc/cocalc/issues/3580
      if (elt == null) return;

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
          frame_actions.focus();
        } else {
          frame_actions.blur();
        }
      }
    }

    async function scroll_cell_list_not_windowed(
      scroll: Scroll
    ): Promise<void> {
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

    async function scroll_cell_list(scroll: Scroll): Promise<void> {
      let list = windowed_list_ref.current;
      if (list == null) {
        // scroll not using windowed list
        scroll_cell_list_not_windowed(scroll);
        return;
      }

      const info = list.get_scroll();

      if (typeof scroll === "number") {
        if (info == null) return;
        list.scrollToPosition(info.scrollOffset + scroll);
        return;
      }

      // supported scroll positions are in types.ts
      if (scroll.startsWith("cell ")) {
        const align = scroll === "cell top" ? "start" : "top";
        if (cur_id == null) return;
        const n = cell_list.indexOf(cur_id);
        if (n == -1) return;
        list.ensure_row_is_visible(n, align);
        await delay(5); // needed due to shift+enter causing output
        list = windowed_list_ref.current;
        if (list == null) return;
        list.ensure_row_is_visible(n, align);
      }
      if (info == null) return;

      switch (scroll) {
        case "list up":
          // move scroll position of list up one page
          list.scrollToPosition(
            info.scrollOffset - list.get_window_height() * 0.9
          );
          break;
        case "list down":
          // move scroll position of list up one page
          list.scrollToPosition(
            info.scrollOffset + list.get_window_height() * 0.9
          );
          break;
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
        if (frame_actions) frame_actions.set_mode("edit");
      }
    }

    function render_insert_cell(
      id: string,
      position: "above" | "below" = "above"
    ): JSX.Element | null {
      if (actions == null || frame_actions == null) return null;
      return (
        <InsertCell
          id={id}
          key={id + "insert" + position}
          position={position}
          actions={actions}
          frame_actions={frame_actions}
        />
      );
    }

    function render_cell(id: string, isScrolling: boolean, index: number) {
      const cell = cells.get(id);
      if (cell == null) return null;
      return (
        <Cell
          key={id}
          id={id}
          index={index}
          actions={actions}
          frame_actions={frame_actions}
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
        />
      );
    }

    function windowed_list_row_renderer({
      key,
      isVisible,
      isScrolling,
      index,
    }): JSX.Element {
      const is_last: boolean = key === cell_list.get(-1);
      return (
        <div>
          {render_insert_cell(key, "above")}
          {render_cell(key, isScrolling || !isVisible, index)}
          {is_last ? render_insert_cell(key, "below") : undefined}
        </div>
      );
    }

    function render_list_of_cells_using_windowed_list(): JSX.Element {
      let cache_id: undefined | string = undefined;
      if (name != null && frame_actions != null) {
        cache_id = name + frame_actions.frame_id;
      }

      return (
        <WindowedList
          ref={windowed_list_ref}
          overscan_row_count={
            use_windowed_list ? DEFAULT_WINDOWED_SIZE : NON_WINDOWED_SIZE
          }
          estimated_row_size={DEFAULT_ROW_SIZE}
          row_key={(index) => cell_list.get(index)}
          row_count={cell_list.size}
          row_renderer={windowed_list_row_renderer}
          cache_id={cache_id}
          use_is_scrolling={true}
          hide_resize={true}
          render_info={true}
          scroll_margin={60}
        />
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
        v.push(render_cell(id, false, index));
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

    function render_list_of_cells(): JSX.Element | (JSX.Element | null)[] {
      if (actions == null || !use_windowed_list) {
        return render_list_of_cells_directly();
      }

      return (
        <div
          className="smc-vfill"
          style={{
            backgroundColor: "#fff",
            paddingLeft: "5px",
            overflowY: "auto",
          }}
        >
          {render_list_of_cells_using_windowed_list()}
        </div>
      );
    }

    if (cell_list == null) {
      return render_loading();
    }

    const style: React.CSSProperties = {
      fontSize: `${font_size}px`,
      paddingLeft: "5px",
      height: "100%",
      overflowY: "auto",
      overflowX: "hidden",
    };

    return (
      <div
        key="cells"
        className="smc-vfill"
        style={style}
        ref={(node: any) => {
          cell_list_node.current = node;
          frame_actions?.set_cell_list_div(node);
        }}
        onClick={actions != null && complete != null ? on_click : undefined}
        onScroll={debounce(() => {
          save_scroll();
        }, 3000)}
      >
        {render_list_of_cells()}
      </div>
    );
  }
);
