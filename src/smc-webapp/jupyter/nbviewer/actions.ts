/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Redux actions for nbviewer.
*/

import { fromJS } from "immutable";
import { Actions } from "../../app-framework";
import { cm_options } from "../cm_options";
import { sorted_cell_list } from "../cell-utils";
import { JUPYTER_MIMETYPES } from "../util";
import { IPynbImporter } from "../import-from-ipynb";
import { WebappClient } from "../../webapp-client";

import { NBViewerState, NBViewerStore } from "./store";
import { close } from "smc-util/misc";

export class NBViewerActions extends Actions<NBViewerState> {
  public _init = (
    project_id: string,
    path: string,
    _store: NBViewerStore,
    _client?: WebappClient,
    content?: string
  ): void => {
    if (content == null) {
      throw Error("content must be defined");
    }
    this.setState({
      project_id,
      path,
      font_size:
        this.redux.getStore("account") &&
        this.redux.getStore("account").get("font_size", 14),
    });
    if (content == null) {
      throw Error("NBViewer without content is deprecated");
      return;
    }
    // optionally specify the pre-loaded content of the path directly.
    try {
      this.set_from_ipynb(JSON.parse(content));
    } catch (err) {
      this.setState({ error: `Error parsing -- ${err}` });
    }
  };

  private _process = (content: any): void => {
    if (content.data == null) {
      return;
    }
    for (const type of JUPYTER_MIMETYPES) {
      if (
        content.data[type] != null &&
        (type.split("/")[0] === "image" || type === "application/pdf")
      ) {
        content.data[type] = { value: content.data[type] };
      }
    }
  };

  set_from_ipynb = (ipynb: any) => {
    const importer = new IPynbImporter();
    importer.import({
      ipynb,
      output_handler: (cell: any) => {
        let k = 0;
        return {
          message: (content) => {
            this._process(content);
            cell.output[`${k}`] = content;
            return (k += 1);
          },
        };
      },
    });

    const cells = fromJS(importer.cells());
    const cell_list = sorted_cell_list(cells);

    let mode: string | undefined = undefined;
    if (
      ipynb.metadata &&
      ipynb.metadata.language_info &&
      ipynb.metadata.language_info.codemirror_mode
    ) {
      mode = ipynb.metadata.language_info.codemirror_mode;
    } else if (
      ipynb.metadata &&
      ipynb.metadata.language_info &&
      ipynb.metadata.language_info.name
    ) {
      mode = ipynb.metadata.language_info.name;
    } else if (
      ipynb.metadata &&
      ipynb.metadata.kernelspec &&
      ipynb.metadata.kernelspec.language
    ) {
      mode = ipynb.metadata.kernelspec.language.toLowerCase();
    }
    const options = fromJS({
      markdown: undefined,
      options: cm_options(mode),
    });
    return this.setState({
      cells,
      cell_list,
      cm_options: options,
    });
  };
  close = () => {
    close(this);
  };
}
