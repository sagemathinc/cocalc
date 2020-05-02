/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// React component that renders the ordered list of cells

declare const $: any;

const DEFAULT_ROW_SIZE: number = 64;

import { delay } from "awaiting";
import * as immutable from "immutable";

import { React, Component, Rendered } from "../app-framework";
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
  // NOTE: if the value of use_windowed_list *changes* while mounted, we don't re-render everything,
  // which would be a mess and is not really a good idea... since the main use of windowing is to
  // make the initial render fast.  If it is already rendered, why mess it up?
}

export class CellList extends Component<CellListProps> {
  private cell_list_node: HTMLElement;
  private is_mounted: boolean = true;
  private use_windowed_list: boolean;
  private windowed_list_ref = React.createRef<WindowedList>();

  constructor(props) {
    super(props);
    this.use_windowed_list =
      !!this.props.use_windowed_list &&
      this.props.actions != null &&
      this.props.frame_actions != null;
    if (this.use_windowed_list && this.props.frame_actions != null) {
      this.props.frame_actions.set_windowed_list_ref(this.windowed_list_ref);
    }
  }

  public componentWillUnmount(): void {
    this.is_mounted = false;

    if (this.props.frame_actions != null) {
      this.save_scroll();
      // handle focus via an event handler on window.
      // We have to do this since, e.g., codemirror editors
      // involve spans that aren't even children, etc...
      $(window).unbind("click", this.window_click);
      this.props.frame_actions.disable_key_handler();
    }
  }

  private save_scroll(): void {
    if (
      this.use_windowed_list &&
      this.props.frame_actions != null &&
      this.windowed_list_ref.current != null
    ) {
      const info = this.windowed_list_ref.current.get_scroll();
      if (info != null) {
        this.props.frame_actions.set_scrollTop(info.scrollOffset);
      }
    }
  }

  private async restore_scroll(): Promise<void> {
    if (this.props.scrollTop == null) return;
    /* restore scroll state -- as rendering happens dynamically
       and asynchronously, and I have no idea how to know when
       we are done, we can't just do this once.  Instead, we
       keep resetting scrollTop a few times.
    */
    let scrollHeight: number = 0;
    for (const tm of [0, 1, 100, 150]) {
      if (!this.is_mounted) return;
      if (this.use_windowed_list) {
        if (this.windowed_list_ref.current != null) {
          this.windowed_list_ref.current.scrollToPosition(this.props.scrollTop);
        }
      } else {
        const elt = this.cell_list_node;
        if (elt != null && elt.scrollHeight !== scrollHeight) {
          // dynamically rendering actually changed something
          elt.scrollTop = this.props.scrollTop;
          scrollHeight = elt.scrollHeight;
        }
      }
      await delay(tm);
    }
  }

  public componentDidMount(): void {
    this.restore_scroll();
    if (this.props.frame_actions != null) {
      // Enable keyboard handler if necessary
      if (this.props.is_focused) {
        this.props.frame_actions.enable_key_handler();
      }
      // Also since just mounted, set this to be focused.
      // When we have multiple editors on the same page, we will
      // have to set the focus at a higher level (in the project store?).
      this.props.frame_actions.focus(true);
      // setup a click handler so we can manage focus
      $(window).on("click", this.window_click);
    }

    if (this.props.frame_actions != null) {
      this.props.frame_actions.cell_list_div = $(this.cell_list_node);
    }
  }

  private window_click = (event: any): void => {
    if (this.props.frame_actions == null) return;
    if ($(".in.modal").length) {
      // A bootstrap modal is currently opened, e.g., support page, etc.
      // so do not focus no matter what -- in fact, blur for sure.
      this.props.frame_actions.blur();
      return;
    }
    // if click in the cell list, focus the cell list; otherwise, blur it.
    const elt = $(this.cell_list_node);
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
        this.props.frame_actions.focus();
      } else {
        this.props.frame_actions.blur();
      }
    }
  };

  public componentWillReceiveProps(nextProps): void {
    if (this.props.frame_actions == null) return;
    if (nextProps.is_focused !== this.props.is_focused) {
      // the focus state changed.
      if (nextProps.is_focused) {
        this.props.frame_actions.enable_key_handler();
      } else {
        this.props.frame_actions.disable_key_handler();
      }
    }
    if (nextProps.scroll != null) {
      this.scroll_cell_list(nextProps.scroll);
      this.props.frame_actions.scroll(); // reset scroll request state
    }
  }

  private async scroll_cell_list(scroll: Scroll): Promise<void> {
    if (!this.use_windowed_list) return;
    let list = this.windowed_list_ref.current;
    if (list == null) return;
    const info = list.get_scroll();

    if (typeof scroll === "number") {
      if (info == null) return;
      list.scrollToPosition(info.scrollOffset + scroll);
      return;
    }

    // supported scroll positions are in types.ts
    if (scroll === "cell visible") {
      if (this.props.cur_id == null) return;
      const n = this.props.cell_list.indexOf(this.props.cur_id);
      if (n == -1) return;
      list.ensure_row_is_visible(n, "top");
      await delay(5); // needed due to shift+enter causing output
      list = this.windowed_list_ref.current;
      if (list == null) return;
      list.ensure_row_is_visible(n, "top");
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

  private render_loading(): Rendered {
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

  private on_click = (e) => {
    if (this.props.actions) this.props.actions.clear_complete();
    if ($(e.target).hasClass("cocalc-complete")) {
      // Bootstrap simulates a click even when user presses escape; can't catch there.
      // See the complete component in codemirror-static.
      if (this.props.frame_actions) this.props.frame_actions.set_mode("edit");
    }
  };

  private render_insert_cell(
    id: string,
    position: "above" | "below" = "above"
  ): Rendered {
    if (this.props.actions == null || this.props.frame_actions == null) return;
    return (
      <InsertCell
        id={id}
        key={id + "insert" + position}
        position={position}
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
      />
    );
  }

  private render_cell(
    id: string,
    isScrolling: boolean,
    index: number
  ): Rendered {
    const cell = this.props.cells.get(id);
    return (
      <Cell
        key={id}
        id={id}
        index={index}
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        name={this.props.name}
        cm_options={this.props.cm_options}
        cell={cell}
        is_current={id === this.props.cur_id}
        hook_offset={this.props.hook_offset}
        is_selected={
          this.props.sel_ids != null
            ? this.props.sel_ids.contains(id)
            : undefined
        }
        is_markdown_edit={
          this.props.md_edit_ids != null
            ? this.props.md_edit_ids.contains(id)
            : undefined
        }
        mode={this.props.mode}
        font_size={this.props.font_size}
        project_id={this.props.project_id}
        directory={this.props.directory}
        complete={this.props.complete}
        is_focused={this.props.is_focused}
        more_output={
          this.props.more_output != null
            ? this.props.more_output.get(id)
            : undefined
        }
        cell_toolbar={this.props.cell_toolbar}
        trust={this.props.trust}
        is_scrolling={isScrolling}
      />
    );
  }

  private windowed_list_row_renderer({
    key,
    isVisible,
    isScrolling,
    index,
  }): Rendered {
    const is_last: boolean = key === this.props.cell_list.get(-1);
    return (
      <div>
        {this.render_insert_cell(key, "above")}
        {this.render_cell(key, isScrolling || !isVisible, index)}
        {is_last ? this.render_insert_cell(key, "below") : undefined}
      </div>
    );
  }

  private render_list_of_cells_using_windowed_list(): Rendered {
    let cache_id: undefined | string = undefined;
    if (this.props.name != null && this.props.frame_actions != null) {
      cache_id = this.props.name + this.props.frame_actions.frame_id;
    }

    return (
      <WindowedList
        ref={this.windowed_list_ref}
        overscan_row_count={10}
        estimated_row_size={DEFAULT_ROW_SIZE}
        row_key={(index) => this.props.cell_list.get(index)}
        row_count={this.props.cell_list.size}
        row_renderer={this.windowed_list_row_renderer.bind(this)}
        cache_id={cache_id}
        use_is_scrolling={true}
        hide_resize={true}
        render_info={true}
        scroll_margin={60}
      />
    );
  }

  private render_list_of_cells_directly(): Rendered[] {
    const v: Rendered[] = [];
    let index: number = 0;
    this.props.cell_list.forEach((id: string) => {
      if (this.props.actions != null) {
        v.push(this.render_insert_cell(id));
      }
      v.push(this.render_cell(id, false, index));
      index += 1;
    });
    if (this.props.actions != null && v.length > 0) {
      const id = this.props.cell_list.get(this.props.cell_list.size - 1);
      if (id != null) {
        v.push(this.render_insert_cell(id, "below"));
      }
    }

    return v;
  }

  private render_list_of_cells(): Rendered | Rendered[] {
    const style: React.CSSProperties = {
      backgroundColor: "#fff",
      paddingLeft: "5px",
    };

    if (this.use_windowed_list) {
      return (
        <div className="smc-vfill" style={style}>
          {this.render_list_of_cells_using_windowed_list()}
        </div>
      );
    } else {
      return <div style={style}>{this.render_list_of_cells_directly()}</div>;
    }
  }

  public render(): Rendered {
    if (this.props.cell_list == null) {
      return this.render_loading();
    }

    const style: React.CSSProperties = {
      fontSize: `${this.props.font_size}px`,
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
        ref={(node: any) => (this.cell_list_node = node)}
        onClick={
          this.props.actions != null && this.props.complete != null
            ? this.on_click
            : undefined
        }
      >
        {this.render_list_of_cells()}
      </div>
    );
  }
}
