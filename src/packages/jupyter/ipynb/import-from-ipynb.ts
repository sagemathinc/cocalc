/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Importing from an ipynb object (in-memory version of .ipynb file)
*/

import * as misc from "@cocalc/util/misc";
import { JUPYTER_MIMETYPES } from "@cocalc/jupyter/util/misc";
import { type Message } from "@cocalc/jupyter/execute/output-handler";
import { close } from "@cocalc/util/misc";

export const DEFAULT_IPYNB = {
  cells: [
    {
      cell_type: "code",
      execution_count: null,
      metadata: {} as any,
      outputs: [] as any[],
      source: [] as string[],
    },
  ],
  metadata: {
    kernelspec: undefined,
    language_info: undefined,
  },
  nbformat: 4,
  nbformat_minor: 4,
};

export class IPynbImporter {
  private _ipynb: any;
  private _new_id?: (is_available?: (string) => boolean) => string;
  private _cellOutputHandler?: (cell) => {
    message: (content: Message, k?) => void;
    done?: () => void;
  };
  private _existing_ids: string[];
  private _cells: any;
  private _kernel: any;
  private _metadata: any;

  import = ({
    ipynb,
    new_id,
    existing_ids = [],
    cellOutputHandler,
  }: {
    ipynb: object;
    // function that returns an unused id given
    // an is_available function; new_id(is_available) = a new id.
    new_id?: (is_available?: (string) => boolean) => string;
    // re-use these on loading for efficiency purposes
    existing_ids?: string[];
    cellOutputHandler?: (cell) => {
      message: (content: Message, k?) => void;
      done?: () => void;
    };
  }) => {
    this._ipynb = misc.deep_copy(ipynb);
    this._new_id = new_id;
    this._cellOutputHandler = cellOutputHandler;
    this._existing_ids = existing_ids; // option to re-use existing ids

    // must come before sanity checks, as old versions are "insane". -- see https://github.com/sagemathinc/cocalc/issues/1937
    this._handle_old_versions();
    this._sanity_improvements();
    this._import_settings();
    this._import_metadata();
    this._read_in_cells();
  };
  cells = () => {
    return this._cells;
  };

  kernel = () => {
    return this._kernel;
  };

  metadata = () => {
    return this._metadata;
  };

  close = () => {
    close(this);
  };

  // Everything below is the internal private implementation.

  private _sanity_improvements = () => {
    // Do some basic easy sanity improvements to ipynb boject,
    // in case parts of the object are missing.
    const ipynb = this._ipynb;
    if (ipynb.cells == null || ipynb.cells.length === 0) {
      ipynb.cells = misc.deep_copy(DEFAULT_IPYNB.cells);
    }
    if (ipynb.metadata == null) {
      ipynb.metadata = misc.deep_copy(DEFAULT_IPYNB.metadata);
    }
    if (ipynb.nbformat == null) {
      ipynb.nbformat = DEFAULT_IPYNB.nbformat;
    }
    ipynb.nbformat_minor != null
      ? ipynb.nbformat_minor
      : (ipynb.nbformat_minor = DEFAULT_IPYNB.nbformat_minor);
  };

  private _handle_old_versions = () => {
    // Update the ipynb file from formats before version 4.
    // There are other changes made when parsing cells.
    const ipynb = this._ipynb;
    if (ipynb.nbformat >= 4) {
      return;
    }
    if (ipynb.cells == null) {
      ipynb.cells = [];
    }
    for (const worksheet of ipynb.worksheets || []) {
      for (const cell of worksheet.cells || []) {
        if (cell.input != null) {
          cell.source = cell.input;
          delete cell.input;
        }
        if (cell.cell_type === "heading") {
          cell.cell_type = "markdown";
          if (misc.is_array(cell.source)) {
            cell.source = cell.source.join("");
          }
          cell.source = `# ${cell.source}`;
        }
        if (cell.outputs) {
          for (const mesg of cell.outputs) {
            if (mesg.output_type === "pyout") {
              for (const type of JUPYTER_MIMETYPES) {
                const b = type.split("/")[1];
                if (mesg[b] != null) {
                  const data = { [type]: mesg[b] };
                  for (const k in mesg) {
                    delete mesg[k];
                  }
                  mesg.data = data;
                  break;
                }
              }
              if (mesg.text != null) {
                const data = { "text/plain": mesg.text.join("") };
                for (const k in mesg) {
                  delete mesg[k];
                }
                mesg.data = data;
              }
            }
          }
        }
        ipynb.cells.push(cell);
      }
    }
  };

  _import_settings = () => {
    this._kernel =
      this._ipynb &&
      this._ipynb.metadata &&
      this._ipynb.metadata.kernelspec &&
      this._ipynb.metadata.kernelspec.name;
    if (this._kernel != null) {
      // kernel names are supposed to be case insensitive
      // https://jupyter-client.readthedocs.io/en/latest/kernels.html
      // We also make them all lower case when reading them in at
      // src/packages/jupyter/kernel/kernel-data.ts
      this._kernel = this._kernel.toLowerCase();
    }
  };

  _import_metadata = () => {
    const m = this._ipynb != null ? this._ipynb.metadata : undefined;
    if (m == null) {
      return;
    }
    const metadata: any = {};
    for (const k in m) {
      const v = m[k];
      if (k === "kernelspec") {
        continue;
      }
      metadata[k] = v;
    }
    if (misc.len(metadata) > 0) {
      this._metadata = metadata;
    }
  };

  _read_in_cells = () => {
    const ipynb = this._ipynb;
    this._cells = {};
    if ((ipynb != null ? ipynb.cells : undefined) == null) {
      // nothing to do
      return;
    }
    let n = 0;
    for (let cell of ipynb.cells) {
      cell = this._import_cell(cell, n);
      this._cells[cell.id] = cell;
      n += 1;
    }
  };

  _update_output_format = (content: any) => {
    if ((this._ipynb != null ? this._ipynb.nbformat : undefined) >= 4) {
      return content;
    }
    // fix old deprecated fields
    if (content.output_type === "stream") {
      if (misc.is_array(content.text)) {
        content.text = content.text.join("");
      }
      content.name = content.stream;
    } else {
      for (const t of JUPYTER_MIMETYPES) {
        const b = t.split("/")[1];
        if (content[b] != null) {
          content = { data: { [t]: content[b] } };
          break; // at most one data per message.
        }
      }
      if (content.text != null) {
        content = {
          data: { "text/plain": content.text },
          output_type: "stream",
        };
      }
    }
    return content;
  };

  _join_array_strings_obj = (obj: any) => {
    if (obj != null) {
      for (const key in obj) {
        const val = obj[key];
        if (misc.is_array(val)) {
          obj[key] = val.join("");
        }
      }
    }
    return obj;
  };

  // Mutate content to be of the format we use internally
  _import_cell_output_content = (content: any): void => {
    content = this._update_output_format(content); // old versions
    this._join_array_strings_obj(content.data); // arrays --> strings
    if (misc.is_array(content.text)) {
      content.text = content.text.join("");
    }
    delete content.prompt_number; // redundant; in some files
  };

  _id_is_available = (id: any) => {
    return !(
      (this._cells != null ? this._cells[id] : undefined) ||
      (this._existing_ids != null ? this._existing_ids : []).includes(id)
    );
  };

  _get_new_id = (cell) => {
    if (cell?.id && this._id_is_available(cell.id)) {
      // attempt to use id in the ipynb file
      return cell.id;
    }
    if (this._new_id != null) {
      return this._new_id(this._id_is_available);
    } else {
      let id = 0;
      while (true) {
        const s = `${id}`;
        if (this._id_is_available(s)) {
          return s;
        }
        id += 1;
      }
    }
  };

  _get_exec_count = (execution_count?: number, prompt_number?: number) => {
    if (execution_count != null) {
      return execution_count;
    } else if (prompt_number != null) {
      return prompt_number;
    } else {
      return null;
    }
  };

  _get_cell_type = (cell_type?: string) => {
    return cell_type != null ? cell_type : "code";
  };

  _get_cell_output = (outputs: any, alt_outputs: any, id: any) => {
    if (outputs == null || outputs.length == 0) {
      return null;
    }
    const cell: any = { id, output: {} };
    const handler = this._cellOutputHandler?.(cell);
    let k: string; // it's perfectly fine that k is a string here.
    for (k in outputs) {
      let content = outputs[k];
      if (alt_outputs != null && alt_outputs[k] != null) {
        content = alt_outputs[k];
      }
      this._import_cell_output_content(content);
      if (handler != null) {
        handler.message(content, k);
      } else {
        cell.output[k] = content;
      }
    }
    handler?.done?.();
    return cell.output;
  };

  _get_cell_input(source) {
    if (source != null) {
      // "If you intend to work with notebook files directly, you must allow multi-line
      // string fields to be either a string or list of strings."
      // https://nbformat.readthedocs.io/en/latest/format_description.html#top-level-structure
      if (misc.is_array(source)) {
        return source.join("");
      } else {
        return source;
      }
    } else {
      return null;
    }
  }

  _import_cell = (cell: any, n: any) => {
    const id = this._existing_ids[n] ?? this._get_new_id(cell);
    const obj: any = {
      type: "cell",
      id,
      pos: n,
      input: this._get_cell_input(cell.source),
      output: this._get_cell_output(
        cell.outputs,
        cell.metadata != null && cell.metadata.cocalc != null
          ? cell.metadata.cocalc.outputs
          : undefined,
        id,
      ),
      cell_type: this._get_cell_type(cell.cell_type),
      exec_count: this._get_exec_count(
        cell.execution_count,
        cell.prompt_number,
      ),
    };

    if (cell.metadata != null) {
      for (const k of ["collapsed", "scrolled"]) {
        if (cell.metadata[k]) {
          obj[k] = !!(cell.metadata != null ? cell.metadata[k] : undefined);
        }
      }

      if (cell.metadata.slideshow != null) {
        obj.slide = cell.metadata.slideshow.slide_type;
      }

      if (cell.metadata.tags != null) {
        obj.tags = misc.dict(cell.metadata.tags.map((tag) => [tag, true]));
      }
      const other = misc.copy_without(cell.metadata, [
        "collapsed",
        "scrolled",
        "slideshow",
        "tags",
        "_root",
        "__ownerID",
        "__hash",
        "__altered",
      ]);
      //  See https://github.com/sagemathinc/cocalc/issues/3191 for
      // why the _'d ones above; this is to fix "corrupted" worksheets.
      if (misc.len(other) > 0) {
        obj.metadata = other;
      }
    }
    if (cell.attachments != null) {
      obj.attachments = {};
      for (const name in cell.attachments) {
        const val = cell.attachments[name];
        for (const mime in val) {
          const base64 = val[mime];
          obj.attachments[name] = { type: "base64", value: base64 };
        }
      }
    }
    return obj;
  };
}
