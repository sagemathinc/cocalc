/*
React component that renders the ordered list of cells
**as a single codemirror editor document**

Meant as a simple proof of concept.
*/

const SAVE_INTERVAL_MS = 1;

import { React, Component, ReactDOM } from "../app-framework"; // TODO: this will move
const { CodeMirror } = require("./codemirror");
import * as immutable from "immutable";
const { Loading } = require("../r_misc");
const syncstring = require("smc-util/syncstring");
import * as underscore from "underscore";

interface CellListProps {
  actions: any;
  cell_list: immutable.List<any>; // list of ids of cells in order
  cells: immutable.Map<any, any>;
  font_size: number;
  sel_ids: immutable.Set<any>; // set of selected cells
  md_edit_ids: immutable.Set<any>;
  cur_id?: string; // cell with the green cursor around it; i.e., the cursor cell
  mode: string;
  cm_options?: immutable.Map<any, any>;
}

export class CellList extends Component<CellListProps> {
  private cm: any;
  private _cm_change: any;
  private _cm_last_remote: any;

  render_loading() {
    return (
      <div style={{ fontSize: "32pt", color: "#888", textAlign: "center", marginTop: "15px" }}>
        <Loading />
      </div>
    );
  }

  compute_value(cell_list: any, cells: any) {
    const v: string[] = [];
    cell_list.map((id: any) => {
      const cell = cells.get(id);
      let s = `In[${id}] ${cell.get("input")}`;
      const output = cell.get("output");
      if (output != null) {
        s += `\nOut[${id}] ${JSON.stringify(output)}`;
      }
      v.push(s);
    });
    const value = v.join("\n\n");
    return value;
  }

  parse_and_save = (value: any) => {
    while (true) {
      let i = value.indexOf("In[");
      if (i === -1) {
        return;
      }
      value = value.slice(i + 3);
      i = value.indexOf("]");
      if (i === -1) {
        return;
      }
      const id = value.slice(0, i);
      value = value.slice(i + 2);
      const prompt = `\nOut[${id}]`;
      i = value.indexOf(prompt);
      if (i !== -1) {
        value = value.slice(0, i);
      }
      this.props.actions.set_cell_input(id, value);
      value = value.slice(i + 1);
    }
  };

  componentDidMount() {
    this.init_codemirror();
  }

  _cm_destroy = () => {
    if (this.cm != null) {
      this.cm.toTextArea();
      if (this._cm_change != null) {
        this.cm.off("change", this._cm_change);
        delete this._cm_change;
      }
      delete this._cm_last_remote;
      return delete this.cm;
    }
  };

  _cm_cursor = () => {
    if (this.cm._setValueNoJump) {
      // if true, cursor move is being caused by external setValueNoJump
      return;
    }
    const locs = this.cm.listSelections().map(c => ({ x: c.anchor.ch, y: c.anchor.line }));
    return this.props.actions.set_cursor_locs(locs);
  };

  _cm_save = () => {
    if (this.cm == null) {
      return;
    }
    const value = this.cm.getValue();
    if (value !== this._cm_last_remote) {
      // only save if we actually changed something
      this._cm_last_remote = value;
      return this.parse_and_save(value);
    }
  };

  _cm_merge_remote = (cell_list: any, cells: any) => {
    let new_val: any;
    if (this.cm == null) {
      return;
    }
    const remote = this.compute_value(cell_list, cells);
    if (this._cm_last_remote != null) {
      if (this._cm_last_remote === remote) {
        return; // nothing to do
      }
      const local = this.cm.getValue();
      new_val = syncstring.three_way_merge({
        base: this._cm_last_remote,
        local,
        remote,
      });
    } else {
      new_val = remote;
    }
    this._cm_last_remote = new_val;
    return this.cm.setValueNoJump(new_val);
  };

  _cm_undo = () => {
    if (!this.props.actions.syncdb.in_undo_mode() || this.cm.getValue() !== this._cm_last_remote) {
      this._cm_save();
    }
    return this.props.actions.undo();
  };

  _cm_redo = () => {
    return this.props.actions.redo();
  };

  init_codemirror = () => {
    this._cm_destroy();
    // TODO: avoid findDOMNode using refs
    const node: any = $(ReactDOM.findDOMNode(this)).find("textarea")[0];
    const options = this.props.cm_options != null ? this.props.cm_options.toJS() : {};
    this.cm = CodeMirror.fromTextArea(node, options);
    $(this.cm.getWrapperElement()).css({ height: "auto", backgroundColor: "#f7f7f7" });
    this._cm_merge_remote(this.props.cell_list, this.props.cells);
    this._cm_change = underscore.debounce(this._cm_save, SAVE_INTERVAL_MS);
    this.cm.on("change", this._cm_change);

    // replace undo/redo by our sync aware versions
    this.cm.undo = this._cm_undo;
    return (this.cm.redo = this._cm_redo);
  };

  componentWillReceiveProps(nextProps) {
    if (
      this.cm == null ||
      !(this.props.cm_options && this.props.cm_options.equals(nextProps.cm_options)) ||
      this.props.font_size !== nextProps.font_size
    ) {
      this.init_codemirror();
      return;
    }
    if (nextProps.cells !== this.props.cells || nextProps.cell_list !== this.props.cell_list) {
      return this._cm_merge_remote(nextProps.cell_list, nextProps.cells);
    }
  }

  componentWillUnmount() {
    if (this.cm != null) {
      this._cm_save();
      const doc: any = this.cm.getDoc();
      delete doc.cm; // so @cm gets freed from memory when destroyed and doc is not attached to it.
      return this._cm_destroy();
    }
  }

  render() {
    (window as any).w = this;
    if (this.props.cell_list == null) {
      return this.render_loading();
    }

    const style: React.CSSProperties = {
      fontSize: `${this.props.font_size}px`,
      paddingLeft: "20px",
      padding: "20px",
      backgroundColor: "#eee",
      height: "100%",
      overflowY: "auto",
      overflowX: "hidden",
    };

    return (
      <div key="cells" style={style} ref="cell_list">
        <div
          style={{
            backgroundColor: "#fff",
            padding: "15px",
            boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
          }}
        >
          <textarea />
        </div>
      </div>
    );
  }
}
