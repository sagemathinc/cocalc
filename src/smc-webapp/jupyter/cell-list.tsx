/*
React component that renders the ordered list of cells
*/

import * as immutable from "immutable";
import { React, Component } from "../app-framework"; // TODO: this will move
const { Loading } = require("../r_misc");
const { Cell } = require("./cell");
const { InsertCell } = require("./insert-cell");

const PADDING = 100;

interface CellListProps {
  actions?: any; // if not defined, then everything read only
  cell_list: immutable.List<any>; // list of ids of cells in order
  cells: immutable.Map<any, any>;
  font_size: number;
  sel_ids?: immutable.Set<any>; // set of selected cells
  md_edit_ids?: immutable.Set<any>;
  cur_id?: string; // cell with the green cursor around it; i.e., the cursor cell
  mode: string;
  cm_options: immutable.Map<any, any>;
  project_id?: string;
  directory?: string;
  scrollTop?: number;
  complete?: immutable.Map<any, any>; // status of tab completion
  is_focused?: boolean;
  more_output?: immutable.Map<any, any>;
  scroll?: number | string;
  cell_toolbar?: string;
  trust?: boolean;
}

export class CellList extends Component<CellListProps> {
  private cell_list_ref: HTMLElement;
  componentWillUnmount() {
    // save scroll state
    const state = this.cell_list_ref ? this.cell_list_ref.scrollTop : undefined;
    if (state != null && this.props.actions != null) {
      this.props.actions.set_scroll_state(state);
    }

    if (this.props.actions != null) {
      // handle focus via an event handler on window.
      // We have to do this since, e.g., codemirror editors
      // involve spans that aren't even children, etc...
      $(window).unbind("click", this.window_click);
      return this.props.actions.disable_key_handler();
    }
  }

  componentDidMount() {
    if (this.props.scrollTop != null) {
      // restore scroll state -- as rendering happens dynamically and asynchronously, and I have no idea how to know
      // when we are done, we can't just do this once.  Instead, we keep resetting scrollTop until scrollHeight
      // stops changing or 2s elapses.
      const locals = {
        scrollTop: this.props.scrollTop,
        scrollHeight: 0
      };
      const f = () => {
        const elt = this.cell_list_ref;
        if (elt != null && elt.scrollHeight !== locals.scrollHeight) {
          // dynamically rendering actually changed something
          elt.scrollTop = locals.scrollTop;
          return (locals.scrollHeight = elt.scrollHeight);
        }
      };
      for (let tm of [0, 250, 750, 1500, 2000]) {
        setTimeout(f, tm);
      }
    }

    if (this.props.actions != null) {
      // Enable keyboard handler if necessary
      if (this.props.is_focused) {
        this.props.actions.enable_key_handler();
      }
      // Also since just mounted, set this to be focused.
      // When we have multiple editors on the same page, we will
      // have to set the focus at a higher level (in the project store?).
      this.props.actions.focus(true);
      // setup a click handler so we can manage focus
      $(window).on("click", this.window_click);
    }

    return this.props.actions != null
      ? (this.props.actions._cell_list_div = $(this.cell_list_ref))
      : undefined;
  }

  window_click = (event: any) => {
    if ($(".in.modal").length) {
      // A bootstrap modal is currently opened, e.g., support page, etc.
      // so do not focus no matter what -- in fact, blur for sure.
      this.props.actions.blur();
      return;
    }
    // if click in the cell list, focus the cell list; otherwise, blur it.
    const elt = $(this.cell_list_ref);
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
        this.props.actions.focus();
      } else {
        this.props.actions.blur();
      }
    }
  };

  componentWillReceiveProps(nextProps) {
    if (
      this.props.actions != null &&
      nextProps.is_focused !== this.props.is_focused
    ) {
      // the focus state changed.
      if (nextProps.is_focused) {
        this.props.actions.enable_key_handler();
      } else {
        this.props.actions.disable_key_handler();
      }
    }
    if (nextProps.scroll != null) {
      this.scroll_cell_list(nextProps.scroll);
      return this.props.actions.scroll();
    }
  } // reset scroll request state

  scroll_cell_list = (scroll: any) => {
    const elt = $(this.cell_list_ref)!;
    if (elt.length > 0) {
      let cur, top;
      if (typeof scroll === "number") {
        elt.scrollTop(elt.scrollTop()! + scroll);
        return;
      }

      // supported scroll positions are in commands.coffee
      if (scroll === "cell visible") {
        // ensure selected cell is visible
        cur = elt.find(`#${this.props.cur_id}`);
        if (cur.length > 0) {
          top = cur.position().top - elt.position().top;
          if (top < PADDING) {
            scroll = "cell top";
          } else if (top > elt.height()! - PADDING) {
            scroll = "cell bottom";
          } else {
            return;
          }
        }
      }
      switch (scroll) {
        case "list up":
          // move scroll position of list up one page
          return elt.scrollTop(elt.scrollTop()! - elt.height()! * 0.9);
        case "list down":
          // move scroll position of list up one page
          return elt.scrollTop(elt.scrollTop()! + elt.height()! * 0.9);
        case "cell top":
          cur = elt.find(`#${this.props.cur_id}`)!;
          if (cur.length > 0) {
            return elt.scrollTop(
              elt.scrollTop()! +
                (cur.position().top - elt.position().top) -
                PADDING
            );
          }
          break;
        case "cell center":
          cur = elt.find(`#${this.props.cur_id}`)!;
          if (cur.length > 0) {
            return elt.scrollTop(
              elt.scrollTop()! +
                (cur.position()!.top - elt.position()!.top) -
                elt.height()! * 0.5
            );
          }
          break;
        case "cell bottom":
          cur = elt.find(`#${this.props.cur_id}`);
          if (cur.length > 0) {
            return elt.scrollTop(
              elt.scrollTop()! +
                (cur.position().top - elt.position().top) -
                elt.height()! * 0.9 +
                PADDING
            );
          }
          break;
      }
    }
  };

  render_loading() {
    return (
      <div
        style={{
          fontSize: "32pt",
          color: "#888",
          textAlign: "center",
          marginTop: "15px"
        }}
      >
        <Loading />
      </div>
    );
  }

  on_click = e => {
    this.props.actions.clear_complete();
    if ($(e.target).hasClass("cocalc-complete")) {
      // Bootstrap simulates a click even when user presses escape; can't catch there.
      // See the complete component in codemirror-static.
      return this.props.actions.set_mode("edit");
    }
  };

  render_insert_cell(id, position = "above") {
    return (
      <InsertCell
        id={id}
        key={id + "insert" + position}
        position={position}
        actions={this.props.actions}
      />
    );
  }

  render() {
    if (this.props.cell_list == null) {
      return this.render_loading();
    }

    const v: any[] = [];
    this.props.cell_list.forEach((id: string) => {
      let left, left1;
      const cell_data = this.props.cells.get(id);
      // is it possible/better idea to use the @actions.store here?
      const editable =
        (left = cell_data.getIn(["metadata", "editable"])) != null
          ? left
          : true;
      const deletable =
        (left1 = cell_data.getIn(["metadata", "deletable"])) != null
          ? left1
          : true;
      const cell = (
        <Cell
          key={id}
          actions={this.props.actions}
          id={id}
          cm_options={this.props.cm_options}
          cell={cell_data}
          is_current={id === this.props.cur_id}
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
          editable={editable}
          deletable={deletable}
        />
      );
      if (this.props.actions != null) {
        v.push(this.render_insert_cell(id));
      }
      v.push(cell);
    });
    if (this.props.actions != null && v.length > 0) {
      const id = this.props.cell_list.get(this.props.cell_list.size - 1);
      v.push(this.render_insert_cell(id, "below"));
    }

    const style: React.CSSProperties = {
      fontSize: `${this.props.font_size}px`,
      paddingLeft: "20px",
      padding: "20px",
      backgroundColor: "#eee",
      height: "100%",
      overflowY: "auto",
      overflowX: "hidden"
    };

    const cells_style: React.CSSProperties = {
      backgroundColor: "#fff",
      padding: "15px",
      boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)"
    };

    return (
      <div
        key="cells"
        style={style}
        ref={(node: any) => (this.cell_list_ref = node)}
        onClick={
          this.props.actions != null && this.props.complete != null
            ? this.on_click
            : undefined
        }
      >
        <div style={cells_style}>{v}</div>
        <div style={{ minHeight: "100px" }} />
      </div>
    );
  }
}
