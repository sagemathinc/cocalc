/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The Store
*/

declare const localStorage: any;

import { from_json, cmp, startswith } from "smc-util/misc";
import { Store } from "../app-framework";
import { Set, Map, List, OrderedMap, fromJS } from "immutable";
import { export_to_ipynb } from "./export-to-ipynb";
import { DEFAULT_COMPUTE_IMAGE } from "smc-util/compute-images";
import { Kernels, Kernel } from "./util";
import { KernelInfo, Cell, CellToolbarName } from "./types";
import { Syntax } from "smc-util/code-formatter";
import { ImmutableUsageInfo } from "smc-project/usage-info/types";

// Used for copy/paste.  We make a single global clipboard, so that
// copy/paste between different notebooks works.
let global_clipboard: any = undefined;

export type show_kernel_selector_reasons = "bad kernel" | "user request";

export function canonical_language(
  kernel?: string,
  kernel_info_lang?: string
): string | undefined {
  let lang;
  // special case: sage is language "python", but the snippet dialog needs "sage"
  if (startswith(kernel, "sage")) {
    lang = "sage";
  } else {
    lang = kernel_info_lang;
  }
  return lang;
}

export interface JupyterStoreState {
  nbconvert_dialog: any;
  cell_toolbar: CellToolbarName;
  edit_attachments?: string;
  edit_cell_metadata: any;
  raw_ipynb: any;
  backend_kernel_info: KernelInfo;
  cell_list: List<string>; // list of id's of the cells
  cells: Map<string, Cell>; // map from string id to cell; the structure of a cell is complicated...
  cur_id: string;
  error?: string;
  fatal: string;
  has_unsaved_changes?: boolean;
  has_uncommitted_changes?: boolean;
  kernel?: string;
  kernels?: Kernels;
  kernel_info?: any;
  max_output_length: number;
  metadata: any; // documented at https://nbformat.readthedocs.io/en/latest/format_description.html#cell-metadata
  md_edit_ids: Set<string>;
  path: string;
  directory: string;
  more_output: any;
  read_only: boolean;
  name: string;
  project_id: string;
  font_size: number;
  sel_ids: any;
  toolbar?: boolean;
  mode: string;
  nbconvert: any;
  about: boolean;
  start_time: any;
  complete: any;
  introspect: any;
  cm_options: any;
  find_and_replace: any;
  keyboard_shortcuts: any;
  confirm_dialog: any;
  insert_image: string; // id of a markdown cell
  scroll: any;
  check_select_kernel_init: boolean;
  show_kernel_selector: boolean;
  show_kernel_selector_reason?: show_kernel_selector_reasons;
  kernel_selection?: Map<string, string>;
  kernels_by_name?: OrderedMap<string, Map<string, string>>;
  kernels_by_language?: OrderedMap<string, List<string>>;
  default_kernel?: string;
  closestKernel?: Kernel;
  widget_model_ids: Set<string>;
  contents?: List<Map<string, any>>; // optional global contents info (about sections, problems, etc.)
  connection_file?: string;
  kernel_error?: string;
  kernel_usage?: ImmutableUsageInfo;
}

export const initial_jupyter_store_state: {
  [K in keyof JupyterStoreState]?: JupyterStoreState[K];
} = {
  check_select_kernel_init: false,
  show_kernel_selector: false,
  widget_model_ids: Set(),
  cell_list: List(),
  cells: Map(),
};

export class JupyterStore extends Store<JupyterStoreState> {
  private _is_project: any;
  private _more_output: any;

  private deprecated(f: string, ...args): void {
    const s = "DEPRECATED JupyterStore." + f;
    console.warn(s, ...args);
  }

  // Return map from selected cell ids to true, in no particular order
  get_selected_cell_ids = () => {
    this.deprecated("get_selected_cell_ids");
    return {};

    const selected = {};
    const cur_id = this.get("cur_id");
    if (cur_id != null) {
      selected[cur_id] = true;
    }
    this.get("sel_ids").map(function (x) {
      selected[x] = true;
    });
    return selected;
  };

  // immutable List
  public get_cell_list = (): List<string> => {
    return this.get("cell_list") ?? List();
  };

  // string[]
  public get_cell_ids_list(): string[] {
    return this.get_cell_list().toJS();
  }

  public get_selected_cell_ids_list = () => {
    this.deprecated("get_selected_cell_ids_list");
    return [];
  };

  public get_cell_type(id: string): "markdown" | "code" | "raw" {
    // NOTE: default cell_type is "code", which is common, to save space.
    // TODO: We use unsafe_getIn because maybe the cell type isn't spelled out yet, or our typescript isn't good enough.
    const type = this.unsafe_getIn(["cells", id, "cell_type"], "code");
    if (type != "markdown" && type != "code" && type != "raw") {
      throw Error(`invalid cell type ${type} for cell ${id}`);
    }
    return type;
  }

  public get_cell_index(id: string): number {
    const cell_list = this.get("cell_list");
    if (cell_list == null) {
      // truly fatal
      throw Error("ordered list of cell id's not known");
    }
    const i = cell_list.indexOf(id);
    if (i === -1) {
      throw Error(`unknown cell id ${id}`);
    }
    return i;
  }

  // Get the id of the cell that is delta positions from
  // cell with given id (second input).
  // Returns undefined if delta positions moves out of
  // the notebook (so there is no such cell); in particular,
  // we do NOT wrap around.
  public get_cell_id(delta = 0, id: string): string | undefined {
    let i: number = this.get_cell_index(id);
    i += delta;
    const cell_list = this.get("cell_list");
    if (cell_list == null || i < 0 || i >= cell_list.size) {
      return; // .get negative for List in immutable wraps around rather than undefined (like Python)
    }
    return cell_list.get(i);
  }

  set_global_clipboard = (clipboard: any) => {
    global_clipboard = clipboard;
  };

  get_global_clipboard = () => {
    return global_clipboard;
  };

  get_local_storage = (key: any) => {
    const value =
      typeof localStorage !== "undefined" && localStorage !== null
        ? localStorage[this.name]
        : undefined;
    if (value != null) {
      const x = from_json(value);
      if (x != null) {
        return x[key];
      }
    }
  };

  get_kernel_info = (kernel: string | undefined): any | undefined => {
    // slow/inefficient, but ok since this is rarely called
    let info: any = undefined;
    const kernels = this.get("kernels");
    if (kernels == null) {
      return;
    }
    kernels.forEach((x: any) => {
      if (x.get("name") === kernel) {
        info = x.toJS();
        return false;
      }
    });
    return info;
  };

  // Export the Jupyer notebook to an ipynb object.
  get_ipynb = (blob_store?: any) => {
    if (this.get("cells") == null || this.get("cell_list") == null) {
      // not sufficiently loaded yet.
      return;
    }

    const cell_list = this.get("cell_list");
    const more_output: { [id: string]: any } = {};
    for (const id of cell_list.toJS()) {
      const x = this.get_more_output(id);
      if (x != null) {
        more_output[id] = x;
      }
    }

    return export_to_ipynb({
      cells: this.get("cells"),
      cell_list,
      metadata: this.get("metadata"), // custom metadata
      kernelspec: this.get_kernel_info(this.get("kernel")),
      language_info: this.get_language_info(),
      blob_store,
      more_output,
    });
  };

  public get_language_info(): object | undefined {
    for (const key of ["backend_kernel_info", "metadata"]) {
      const language_info = this.unsafe_getIn([key, "language_info"]);
      if (language_info != null) return language_info;
    }
  }

  public get_cm_mode() {
    let metadata_immutable = this.get("backend_kernel_info");
    if (metadata_immutable == null) {
      metadata_immutable = this.get("metadata");
    }
    let metadata: { language_info?: any; kernelspec?: any } | undefined;
    if (metadata_immutable != null) {
      metadata = metadata_immutable.toJS();
    } else {
      metadata = undefined;
    }
    let mode: any;
    if (metadata != null) {
      if (
        metadata.language_info != null &&
        metadata.language_info.codemirror_mode != null
      ) {
        mode = metadata.language_info.codemirror_mode;
      } else if (
        metadata.language_info != null &&
        metadata.language_info.name != null
      ) {
        mode = metadata.language_info.name;
      } else if (
        metadata.kernelspec != null &&
        metadata.kernelspec.language != null
      ) {
        mode = metadata.kernelspec.language.toLowerCase();
      }
    }
    if (mode == null) {
      // As a fallback in case none of the metadata has been filled in yet by the backend,
      // we can guess a mode from the kernel in many cases.   Any mode is vastly better
      // than nothing!
      let kernel = this.get("kernel"); // may be better than nothing...; e.g., octave kernel has no mode.
      if (kernel != null) {
        kernel = kernel.toLowerCase();
        // The kernel is just a string that names the kernel, so we use heuristics.
        if (kernel.indexOf("python") != -1) {
          if (kernel.indexOf("python3") != -1) {
            mode = { name: "python", version: 3 };
          } else {
            mode = { name: "python", version: 2 };
          }
        } else if (kernel.indexOf("sage") != -1) {
          mode = { name: "python", version: 3 };
        } else if (kernel.indexOf("anaconda") != -1) {
          mode = { name: "python", version: 3 };
        } else if (kernel.indexOf("octave") != -1) {
          mode = "octave";
        } else if (kernel.indexOf("bash") != -1) {
          mode = "shell";
        } else if (kernel.indexOf("julia") != -1) {
          mode = "text/x-julia";
        } else if (kernel.indexOf("haskell") != -1) {
          mode = "text/x-haskell";
        } else if (kernel.indexOf("javascript") != -1) {
          mode = "javascript";
        } else if (kernel.indexOf("ir") != -1) {
          mode = "r";
        } else if (
          kernel.indexOf("root") != -1 ||
          kernel.indexOf("xeus") != -1
        ) {
          mode = "text/x-c++src";
        } else if (kernel.indexOf("gap") != -1) {
          mode = "gap";
        } else {
          // C is probably a good fallback.
          mode = "text/x-c";
        }
      }
    }
    if (typeof mode === "string") {
      mode = { name: mode }; // some kernels send a string back for the mode; others an object
    }
    return mode;
  }

  get_more_output = (id: string) => {
    if (this._is_project) {
      // This is ONLY used by the backend project for storing extra output.
      if (this._more_output == null) {
        this._more_output = {};
      }
      const output = this._more_output[id];
      if (output == null) {
        return;
      }
      let { messages } = output;

      for (const x of ["discarded", "truncated"]) {
        if (output[x]) {
          var text;
          if (x === "truncated") {
            text = "WARNING: some intermediate output was truncated.\n";
          } else {
            text = `WARNING: ${output[x]} intermediate output ${
              output[x] > 1 ? "messages were" : "message was"
            } ${x}.\n`;
          }
          const warn = [{ text: text, name: "stderr" }];
          if (messages.length > 0) {
            messages = warn.concat(messages).concat(warn);
          } else {
            messages = warn;
          }
        }
      }
      return messages;
    } else {
      // client  -- return what we know
      const msg_list = this.getIn(["more_output", id, "mesg_list"]);
      if (msg_list != null) {
        return msg_list.toJS();
      }
    }
  };

  get_default_kernel = (): string | undefined => {
    const account = this.redux.getStore("account");
    if (account != null) {
      // TODO: getIn types
      return account.getIn(["editor_settings", "jupyter", "kernel"]);
    } else {
      return undefined;
    }
  };

  /*
   * select all kernels, which are ranked highest for a specific language.
   *
   * kernel metadata looks like that
   *
   *  "display_name": ...,
   *  "argv":, ...
   *  "language": "sagemath",
   *  "metadata": {
   *    "cocalc": {
   *      "priority": 10,
   *      "description": "Open-source mathematical software system",
   *      "url": "https://www.sagemath.org/",
   *      "disabled": true
   *    }
   *  }
   *
   * Return dict of language <-> kernel_name
   */
  get_kernel_selection = (kernels: Kernels): Map<string, string> => {
    const data: any = {};
    kernels
      .filter((entry) => entry.get("language") != null)
      .groupBy((entry) => entry.get("language"))
      .forEach((kernels, lang) => {
        const top: any = kernels
          .sort((a, b) => {
            const va = -a.getIn(["metadata", "cocalc", "priority"], 0);
            const vb = -b.getIn(["metadata", "cocalc", "priority"], 0);
            return cmp(va, vb);
          })
          .first();
        if (top == null || lang == null) return true;
        const name = top.get("name");
        if (name == null) return true;
        data[lang] = name;
      });

    return Map<string, string>(data);
  };

  get_kernels_by_name_or_language = (
    kernels: Kernels
  ): [
    OrderedMap<string, Map<string, string>>,
    OrderedMap<string, List<string>>
  ] => {
    const data_name: any = {};
    let data_lang: any = {};
    const add_lang = (lang, entry) => {
      if (data_lang[lang] == null) data_lang[lang] = [];
      data_lang[lang].push(entry);
    };
    kernels.map((entry) => {
      const name = entry.get("name");
      const lang = entry.get("language");
      if (name != null) data_name[name] = entry;
      if (lang == null) {
        // we collect all kernels without a language under "misc"
        add_lang("misc", entry);
      } else {
        add_lang(lang, entry);
      }
    });
    const by_name = OrderedMap<string, Map<string, string>>(data_name).sortBy(
      (v, k) => {
        return v.get("display_name", v.get("name", k)).toLowerCase();
      }
    );
    // data_lang, we're only interested in the kernel names, not the entry itself
    data_lang = fromJS(data_lang).map((v, k) => {
      v = v
        .sortBy((v) => v.get("display_name", v.get("name", k)).toLowerCase())
        .map((v) => v.get("name"));
      return v;
    });
    const by_lang = OrderedMap<string, List<string>>(
      data_lang
    ).sortBy((_v, k) => k.toLowerCase());
    return [by_name, by_lang];
  };

  get_raw_link = (path: any) => {
    return this.redux
      .getProjectStore(this.get("project_id"))
      .get_raw_link(path);
  };

  // NOTE: defaults for these happen to be true if not given (due to bad
  // choice of name by some extension author).
  public is_cell_editable(id: string): boolean {
    return this.get_cell_metadata_flag(id, "editable", true);
  }

  public is_cell_deletable(id: string): boolean {
    if (!this.is_cell_editable(id)) {
      // I've decided that if a cell is not editable, then it is
      // automatically not deletable.  Relevant facts:
      //    1. It makes sense to me.
      //    2. This is what Jupyter classic does.
      //    3. This is NOT what JupyterLab does.
      //    4. The spec doesn't mention deletable: https://nbformat.readthedocs.io/en/latest/format_description.html#cell-metadata
      // See my rant here: https://github.com/jupyter/notebook/issues/3700
      return false;
    }
    return this.get_cell_metadata_flag(id, "deletable", true);
  }

  public get_cell_metadata_flag(
    id: string,
    key: string,
    default_value: boolean = false
  ): boolean {
    return this.unsafe_getIn(["cells", id, "metadata", key], default_value);
  }

  // canonicalize the language of the kernel
  public get_kernel_language(): string | undefined {
    return canonical_language(
      this.get("kernel"),
      this.getIn(["kernel_info", "language"])
    );
  }

  // map the kernel language to the syntax of a language we know
  public get_kernel_syntax(): Syntax | undefined {
    let lang = this.get_kernel_language();
    if (!lang) return undefined;
    lang = lang.toLowerCase();
    switch (lang) {
      case "python":
      case "python3":
        return "python3";
      case "r":
        return "R";
      case "c++":
      case "c++17":
        return "c++";
      case "javascript":
        return "JavaScript";
    }
  }

  jupyter_kernel_key = (): string => {
    const project_id = this.get("project_id");
    const projects_store = this.redux.getStore("projects");
    const compute_image = projects_store.getIn(
      ["project_map", project_id, "compute_image"],
      DEFAULT_COMPUTE_IMAGE
    );
    const key = [project_id, compute_image].join("::");
    // console.log("jupyter store / jupyter_kernel_key", key);
    return key;
  };
}
