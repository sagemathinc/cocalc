/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that renders the ordered list of cells
**as a single codemirror editor document**

Meant as a simple proof of concept.

ATTN: THIS IS NOT USED RIGHT NOW – TREAT IT AS POTENTIALLY BROKEN
*/

import { debounce } from "lodash";
import * as immutable from "immutable";
import * as CodeMirror from "codemirror";

import { React, ReactDOM, useRef } from "../app-framework";
import { Loading } from "../r_misc";
import * as syncstring from "smc-util/sync/editor/generic/util";
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

export const CellList: React.FC<CellListProps> = React.memo(
  (props: CellListProps) => {
    const {
      actions,
      cell_list,
      cells,
      font_size,
      // sel_ids,
      // md_edit_ids,
      // cur_id,
      // mode,
      cm_options: cm_options_props,
    } = props;

    const [cm_options, set_cm_options] = React.useState<
      immutable.Map<string, any>
    >(immutable.Map());

    const wrapperRef = useRef<HTMLDivElement>(null);
    const cm = useRef<any>(null);
    const cm_change = useRef<any>(null);
    const cm_last_remote = useRef<any>(null);

    React.useEffect(() => {
      init_codemirror();
      return () => {
        if (cm.current != null) {
          cm_save();
          const doc: any = cm.current.getDoc();
          delete doc.cm; // so @cm gets freed from memory when destroyed and doc is not attached to it.
          cm_destroy();
        }
      };
    }, []);

    React.useEffect(() => {
      if (cm_options_props != null && !cm_options.equals(cm_options_props)) {
        set_cm_options(cm_options_props);
      }
    }, [cm_options_props]);

    React.useEffect(() => {
      if (cm.current == null) return;

      cm_merge_remote(cell_list, cells);
    }, [cells, cell_list]);

    // if cm_options (after the check above) or font_size changes,
    // redo the codemirror
    React.useEffect(() => {
      init_codemirror();
    }, [cm_options, font_size]);

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

    function compute_value(
      cell_list: immutable.List<string>,
      cells: immutable.Map<string, any>
    ): string {
      const v: string[] = [];
      cell_list.forEach((id: string): void => {
        const cell = cells.get(id);
        let s = `In[${id}] ${cell.get("input")}`;
        const output = cell.get("output");
        if (output != null) {
          s += `\nOut[${id}] ${JSON.stringify(output)}`;
        }
        v.push(s);
      });
      return v.join("\n\n");
    }

    function parse_and_save(value: string): void {
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
        actions.set_cell_input(id, value);
        value = value.slice(i + 1);
      }
    }

    function cm_destroy(): void {
      if (cm.current != null) {
        cm.current.toTextArea();
        if (cm_change.current != null) {
          cm.current.off("change", cm_change.current);
          cm_change.current = null;
        }
        cm_last_remote.current = null;
        cm.current = null;
      }
    }

    function cm_save(): void {
      if (cm.current == null) {
        return;
      }
      const value = cm.current.getValue();
      if (value !== cm_last_remote.current) {
        // only save if we actually changed something
        cm_last_remote.current = value;
        parse_and_save(value);
      }
    }

    function cm_merge_remote(cell_list: any, cells: any): void {
      let new_val: any;
      if (cm.current == null) {
        return;
      }
      const remote = compute_value(cell_list, cells);
      if (cm_last_remote.current != null) {
        if (cm_last_remote.current === remote) {
          return; // nothing to do
        }
        const local = cm.current.getValue();
        new_val = syncstring.three_way_merge({
          base: cm_last_remote.current,
          local,
          remote,
        });
      } else {
        new_val = remote;
      }
      cm_last_remote.current = new_val;
      cm.current.setValueNoJump(new_val);
    }

    function cm_undo(): void {
      if (
        !actions.syncdb.in_undo_mode() ||
        cm.current.getValue() !== cm_last_remote.current
      ) {
        cm_save();
      }
      actions.undo();
    }

    function cm_redo(): void {
      actions.redo();
    }

    function init_codemirror(): void {
      cm_destroy();
      // TODO: avoid findDOMNode using refs
      const node: any = $(ReactDOM.findDOMNode(wrapperRef.current)).find(
        "textarea"
      )[0];
      const options = cm_options != null ? cm_options.toJS() : {};
      cm.current = CodeMirror.fromTextArea(node, options);
      $(cm.current.getWrapperElement()).css({
        height: "auto",
        backgroundColor: "#f7f7f7",
      });
      cm_merge_remote(cell_list, cells);
      cm_change.current = debounce(cm_save, 1000);
      cm.current.on("change", cm_change.current);

      // replace undo/redo by our sync aware versions
      cm.current.undo = cm_undo;
      cm.current.redo = cm_redo;
    }

    if (cell_list == null) {
      return render_loading();
    }

    const style: React.CSSProperties = {
      fontSize: `${font_size}px`,
      paddingLeft: "20px",
      padding: "20px",
      backgroundColor: "#eee",
      height: "100%",
      overflowY: "auto",
      overflowX: "hidden",
    } as const;

    return (
      <div key="cells" style={style} ref="cell_list">
        <div
          ref={wrapperRef}
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
);
