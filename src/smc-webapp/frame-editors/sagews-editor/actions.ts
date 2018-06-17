/*
Sage Worksheet Editor Actions
*/
import { Map } from "immutable";

import { Actions, CodeEditorState } from "../code-editor/actions";
//import { print_html } from "../frame-tree/print";
import { FrameTree } from "../frame-tree/types";
import { Store } from "../../smc-react-ts";

import { CellObject } from "./types";

import { code_executor, CodeExecutor } from "./sage-session";

interface SageWorksheetEditorState extends CodeEditorState {
  /*  cells: {
    [key: string]: CellObject;
  };
  */
  cells: any;
}

export class SageWorksheetActions extends Actions<SageWorksheetEditorState> {
  protected doctype: string = "syncdb";
  protected primary_keys: string[] = ["type", "id"];
  protected string_cols: string[] = ["input"];
  public store: Store<SageWorksheetEditorState>;

  _init2(): void {
    this.setState({ cells: {} });

    this._syncstring.on("change", keys => {
      keys.forEach(value => {
        let id = value.get("id");
        if (id) {
          let cells = this.store.get("cells");
          cells = cells.set(id, this._get_cell(id));
          this.setState({ cells: cells });
        }
      });
    });
  }

  set_cell(cell: CellObject): void {
    (cell as any).type = "cell";
    this._syncstring.set(cell);
  }

  private _get_cell(id: string): Map<string, any> {
    return this._syncstring.get_one({ id: id, type: "cell" });
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "cells" };
  }

  print(id: string): void {
    console.warn("TODO -- print", id);
  }

  _code_executor(
    code: string,
    data?: object,
    cell_id?: string,
    preparse?: boolean
  ): CodeExecutor {
    // todo: if cell_id is given, ensure is valid.
    return code_executor({path: this.path, code, data, cell_id, preparse});
  }
}
