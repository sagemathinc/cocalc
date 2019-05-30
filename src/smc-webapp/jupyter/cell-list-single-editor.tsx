/*
React component that renders the ordered list of cells
**as a single codemirror editor document**

Meant as a simple proof of concept.
*/

import { React, Component, ReactDOM, Rendered } from "../app-framework";
import { CodeMirror } from "./codemirror";
import * as immutable from "immutable";
import { Loading } from "../r_misc/loading";
import * as syncstring from "smc-util/syncstring";
import * as underscore from "underscore";
import { JupyterActions } from "./browser-actions";
import { NotebookMode } from "./types";

interface CellListProps {
  actions: JupyterActions;
  cell_list: immutable.List<string>; // list of ids of cells in order
  cells: immutable.Map<string, any>;
  font_size: number;
  sel_ids: immutable.Set<string>; // set of selected cells
  md_edit_ids: immutable.Set<string>;
  cur_id?: string; // cell with the green/blue cursor around it; i.e., the cursor cell
  mode: NotebookMode;
  cm_options?: immutable.Map<string, any>;
}

export class CellList extends Component<CellListProps> {
  private cm: any;
  private cm_change: any;
  private cm_last_remote: any;

  private render_loading(): Rendered {
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

  private compute_value(
    cell_list: immutable.List<string>,
    cells: immutable.Map<string, any>
  ): string {
    const v: string[] = [];
    cell_list.forEach(
      (id: string): void => {
        const cell = cells.get(id);
        let s = `In[${id}] ${cell.get("input")}`;
        const output = cell.get("output");
        if (output != null) {
          s += `\nOut[${id}] ${JSON.stringify(output)}`;
        }
        v.push(s);
      }
    );
    return v.join("\n\n");
  }

  private parse_and_save(value: string): void {
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
  }

  public componentDidMount(): void {
    this.init_codemirror();
  }

  private cm_destroy = () : void => {
    if (this.cm != null) {
      this.cm.toTextArea();
      if (this.cm_change != null) {
        this.cm.off("change", this.cm_change);
        delete this.cm_change;
      }
      delete this.cm_last_remote;
      delete this.cm;
    }
  };

  private cm_cursor = (): void => {
    if (this.cm._setValueNoJump) {
      // if true, cursor move is being caused by external setValueNoJump
      return;
    }
    const locs = this.cm
      .listSelections()
      .map(c => ({ x: c.anchor.ch, y: c.anchor.line }));
    this.props.actions.set_cursor_locs(locs);
  };

  private cm_save = () : void => {
    if (this.cm == null) {
      return;
    }
    const value = this.cm.getValue();
    if (value !== this.cm_last_remote) {
      // only save if we actually changed something
      this.cm_last_remote = value;
      this.parse_and_save(value);
    }
  };

  private cm_merge_remote = (cell_list: any, cells: any): void => {
    let new_val: any;
    if (this.cm == null) {
      return;
    }
    const remote = this.compute_value(cell_list, cells);
    if (this.cm_last_remote != null) {
      if (this.cm_last_remote === remote) {
        return; // nothing to do
      }
      const local = this.cm.getValue();
      new_val = syncstring.three_way_merge({
        base: this.cm_last_remote,
        local,
        remote
      });
    } else {
      new_val = remote;
    }
    this.cm_last_remote = new_val;
    this.cm.setValueNoJump(new_val);
  };

  private cm_undo = (): void => {
    if (
      !this.props.actions.syncdb.in_undo_mode() ||
      this.cm.getValue() !== this.cm_last_remote
    ) {
      this.cm_save();
    }
    this.props.actions.undo();
  };

  private cm_redo = (): void => {
    this.props.actions.redo();
  };

  private init_codemirror(): void {
    this.cm_destroy();
    // TODO: avoid findDOMNode using refs
    const node: any = $(ReactDOM.findDOMNode(this)).find("textarea")[0];
    const options =
      this.props.cm_options != null ? this.props.cm_options.toJS() : {};
    this.cm = CodeMirror.fromTextArea(node, options);
    $(this.cm.getWrapperElement()).css({
      height: "auto",
      backgroundColor: "#f7f7f7"
    });
    this.cm_merge_remote(this.props.cell_list, this.props.cells);
    this.cm_change = underscore.debounce(this.cm_save, 1000);
    this.cm.on("change", this.cm_change);

    // replace undo/redo by our sync aware versions
    this.cm.undo = this.cm_undo;
    this.cm.redo = this.cm_redo;
  }

  public componentWillReceiveProps(nextProps): void {
    if (
      this.cm == null ||
      !(
        this.props.cm_options &&
        this.props.cm_options.equals(nextProps.cm_options)
      ) ||
      this.props.font_size !== nextProps.font_size
    ) {
      this.init_codemirror();
      return;
    }
    if (
      nextProps.cells !== this.props.cells ||
      nextProps.cell_list !== this.props.cell_list
    ) {
      return this.cm_merge_remote(nextProps.cell_list, nextProps.cells);
    }
  }

  public componentWillUnmount(): void {
    if (this.cm != null) {
      this.cm_save();
      const doc: any = this.cm.getDoc();
      delete doc.cm; // so @cm gets freed from memory when destroyed and doc is not attached to it.
      this.cm_destroy();
    }
  }

  public render(): Rendered {
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
      overflowX: "hidden"
    };

    return (
      <div key="cells" style={style} ref="cell_list">
        <div
          style={{
            backgroundColor: "#fff",
            padding: "15px",
            boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)"
          }}
        >
          <textarea />
        </div>
      </div>
    );
  }
}
