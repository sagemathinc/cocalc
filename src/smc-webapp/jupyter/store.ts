/*
The Store
*/

declare const localStorage: any;

const misc = require("smc-util/misc");
import { Store } from "../app-framework";
import {
  Set,
  Map as ImmutableMap,
  List as ImmutableList,
  OrderedMap,
  fromJS as immutableFromJS
} from "immutable";
const { export_to_ipynb } = require("./export-to-ipynb");
const { DEFAULT_COMPUTE_IMAGE } = require("smc-util/compute-images");
import { Kernels, Kernel } from "./util";

// Used for copy/paste.  We make a single global clipboard, so that
// copy/paste between different notebooks works.
let global_clipboard: any = undefined;

export type show_kernel_selector_reasons = "bad kernel" | "user request";

export interface JupyterStoreState {
  nbconvert_dialog: any;
  cell_toolbar: string;
  edit_attachments: any;
  edit_cell_metadata: any;
  raw_ipynb: any;
  backend_kernel_info: any;
  cell_list: any;
  cells: any;
  cur_id: any;
  error?: string;
  fatal: string;
  has_unsaved_changes?: boolean;
  has_uncommitted_changes?: boolean;
  kernel?: string;
  kernels?: Kernels;
  kernel_info?: any;
  max_output_length: number;
  metadata: any;
  md_edit_ids: Set<string>;
  path: string;
  directory: string;
  more_output: any;
  read_only: boolean;
  name: string;
  project_id: string;
  font_size: number;
  sel_ids: any;
  toolbar?: any;
  view_mode: string;
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
  insert_image: any;
  scroll: any;
  check_select_kernel_init: boolean;
  show_kernel_selector: boolean;
  show_kernel_selector_reason?: show_kernel_selector_reasons;
  kernel_selection?: ImmutableMap<string, string>;
  kernels_by_name?: OrderedMap<string, ImmutableMap<string, string>>;
  kernels_by_language?: OrderedMap<string, ImmutableList<string>>;
  default_kernel?: string;
  closestKernel?: Kernel;
  widget_model_ids: Set<string>;
}

export const initial_jupyter_store_state: {
  [K in keyof JupyterStoreState]?: JupyterStoreState[K]
} = {
  check_select_kernel_init: false,
  show_kernel_selector: false,
  widget_model_ids: Set()
};

export class JupyterStore extends Store<JupyterStoreState> {
  private _is_project: any;
  private _more_output: any;
  private store: any;
  // Return map from selected cell ids to true, in no particular order
  get_selected_cell_ids = () => {
    const selected = {};
    const cur_id = this.get("cur_id");
    if (cur_id != null) {
      selected[cur_id] = true;
    }
    this.get("sel_ids").map(function(x) {
      selected[x] = true;
    });
    return selected;
  };

  // Return sorted javascript array of the selected cell ids
  get_selected_cell_ids_list = () => {
    // iterate over *ordered* list so we run the selected cells in order
    // TODO: Could do in O(1) instead of O(n) by sorting only selected first by position...; maybe use algorithm based on size...
    const selected = this.get_selected_cell_ids();
    const v: any[] = [];
    const cell_list = this.get("cell_list");
    if (cell_list == null) {
      // special case -- no cells
      return v;
    }
    cell_list.forEach(id => {
      if (selected[id]) {
        v.push(id);
      }
    });
    return v;
  };

  get_cell_index = (id: any) => {
    const cell_list = this.get("cell_list");
    if (cell_list == null) {
      // ordered list of cell id's not known
      return;
    }
    if (id == null) {
      return;
    }
    const i = cell_list.indexOf(id);
    if (i === -1) {
      return;
    }
    return i;
  };

  get_cur_cell_index = () => {
    return this.get_cell_index(this.get("cur_id"));
  };

  // Get the id of the cell that is delta positions from the
  // cursor or from cell with given id (second input).
  // Returns undefined if no currently selected cell, or if delta
  // positions moves out of the notebook (so there is no such cell).
  get_cell_id = (delta = 0, id?: any) => {
    let i;
    if (id != null) {
      i = this.get_cell_index(id);
    } else {
      i = this.get_cur_cell_index();
    }
    if (i == null) {
      return;
    }
    i += delta;
    const cell_list = this.get("cell_list");
    if (cell_list == null || i < 0 || i >= cell_list.size) {
      return; // .get negative for List in immutable wraps around rather than undefined (like Python)
    }
    return cell_list.get(i);
  };

  get_scroll_state = () => {
    return this.get_local_storage("scroll");
  };

  set_global_clipboard = (clipboard: any) => {
    return (global_clipboard = clipboard);
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
      const x = misc.from_json(value);
      if (x != null) {
        return x[key];
      }
    }
  };

  get_kernel_info = (kernel: any): any | undefined => {
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

    const more_output: any = {};
    let cell_list = this.get("cell_list");
    if (cell_list == null) {
      cell_list = [];
    } else {
      cell_list = cell_list.toJS();
    }
    for (let id of cell_list) {
      const x = this.get_more_output(id);
      if (x != null) {
        more_output[id] = x;
      }
    }

    return export_to_ipynb({
      cells: this.get("cells"),
      cell_list: this.get("cell_list"),
      metadata: this.get("metadata"), // custom metadata
      kernelspec: this.get_kernel_info(this.get("kernel")),
      language_info: this.get_language_info(),
      blob_store,
      more_output
    });
  };

  get_language_info = () => {
    const a = this.getIn(["backend_kernel_info", "language_info"]);
    const b = this.getIn(["metadata", "language_info"]);
    return a != null ? a : b;
  };

  get_cm_mode = () => {
    let metadata = this.get("backend_kernel_info");
    if (metadata == null) {
      metadata = this.get("metadata");
    }
    if (metadata != null) {
      metadata = metadata.toJS();
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
      mode = this.get("kernel"); // may be better than nothing...; e.g., octave kernel has no mode.
    }
    if (typeof mode === "string") {
      mode = { name: mode }; // some kernels send a string back for the mode; others an object
    }
    return mode;
  };

  get_more_output = (id: any) => {
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

      for (let x of ["discarded", "truncated"]) {
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
      return account.getIn(["editor_settings", "jupyter", "kernel"] as any);
    } else {
      return undefined;
    }
  };

  /*
   * select all kernels, which are ranked highest for a specific language
   * and do have a priority weight > 0.
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
   *      "url": "https://www.sagemath.org/"
   *    }
   *  }
   *
   * Return dict of language <-> kernel_name
   */
  get_kernel_selection = (kernels: Kernels): ImmutableMap<string, string> => {
    const data: any = {};
    kernels
      .filter(entry => entry.get("language") != null)
      .groupBy(entry => entry.get("language"))
      .forEach((kernels, lang) => {
        const top: any = kernels
          .sort((a, b) => {
            const va = -a.getIn(["metadata", "cocalc", "priority"], 0);
            const vb = -b.getIn(["metadata", "cocalc", "priority"], 0);
            return misc.cmp(va, vb);
          })
          .first();
        if (top == null || lang == null) return true;
        const name = top.get("name");
        if (name == null) return true;
        data[lang] = name;
      });

    return ImmutableMap<string, string>(data);
  };

  get_kernels_by_name_or_language = (
    kernels: Kernels
  ): [
    OrderedMap<string, ImmutableMap<string, string>>,
    OrderedMap<string, ImmutableList<string>>
  ] => {
    let data_name: any = {};
    let data_lang: any = {};
    const add_lang = (lang, entry) => {
      if (data_lang[lang] == null) data_lang[lang] = [];
      data_lang[lang].push(entry);
    };
    kernels.map(entry => {
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
    const by_name = OrderedMap<string, ImmutableMap<string, string>>(
      data_name
    ).sortBy((v, k) => {
      return v.get("display_name", v.get("name", k)).toLowerCase();
    });
    // data_lang, we're only interested in the kernel names, not the entry itself
    data_lang = immutableFromJS(data_lang).map((v, k) => {
      v = v
        .sortBy(v => v.get("display_name", v.get("name", k)).toLowerCase())
        .map(v => v.get("name"));
      return v;
    });
    const by_lang = OrderedMap<string, ImmutableList<string>>(data_lang).sortBy(
      (_v, k) => k.toLowerCase()
    );
    return [by_name, by_lang];
  };

  get_raw_link = (path: any) => {
    return this.redux
      .getProjectStore(this.get("project_id"))
      .get_raw_link(path);
  };

  is_cell_editable = (id: any) => {
    return this.get_cell_metadata_flag(id, "editable");
  };

  is_cell_deletable = (id: any) => {
    return this.get_cell_metadata_flag(id, "deletable");
  };

  check_edit_protection = (id: any, actions: any) => {
    if (!this.is_cell_editable(id)) {
      actions.show_edit_protection_error();
      return true;
    } else {
      return false;
    }
  };

  check_delete_protection = (id: any, actions: any) => {
    if (!this.store.is_cell_deletable(id)) {
      actions.show_delete_protection_error();
      return true;
    } else {
      return false;
    }
  };

  get_cell_metadata_flag = (id: any, key: any) => {
    // default is true
    return this.unsafe_getIn(["cells", id, "metadata", key], true); // TODO: type
  };

  // canonicalize the language of the kernel
  get_kernel_language = (): string | undefined => {
    let lang;
    // special case: sage is language "python", but the assistant needs "sage"
    if (misc.startswith(this.get("kernel"), "sage")) {
      lang = "sage";
    } else {
      lang = this.getIn(["kernel_info", "language"]);
    }
    return lang;
  };

  jupyter_kernel_key = (): string => {
    const project_id = this.get("project_id");
    const projects_store = this.redux.getStore("projects");
    const path = ["project_map", project_id, "compute_image"];
    const compute_image = projects_store.getIn(path, DEFAULT_COMPUTE_IMAGE);
    const key = [project_id, compute_image].join("::");
    // console.log("jupyter store / jupyter_kernel_key", key);
    return key;
  };
}
