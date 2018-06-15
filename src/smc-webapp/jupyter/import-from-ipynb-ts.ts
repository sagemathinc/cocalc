/*
Importing from an ipynb object (in-memory version of .ipynb file)
*/
const misc = require("smc-util/misc");
const util = require("./util");

const DEFAULT_IPYNB = {
  cells: [
    {
      cell_type: "code",
      execution_count: null,
      metadata: {},
      outputs: [],
      source: []
    }
  ],
  metadata: {
    kernelspec: {
      display_name: "Python 2",
      language: "python",
      name: "python2"
    },
    language_info: {
      codemirror_mode: { name: "ipython", version: 2 },
      file_extension: ".py",
      mimetype: "text/x-python",
      name: "python",
      nbconvert_exporter: "python",
      pygments_lexer: "ipython2",
      version: "2.7.13"
    }
  },
  nbformat: 4,
  nbformat_minor: 0
};

export class IPynbImporter {
  private _ipynb: any;
  private _new_id: any;
  private _output_handler: any;
  private _process_attachment: any;
  private _existing_ids: any;
  private _cells: any;
  private _kernel: any;
  private _metadata: any;
  private _language_info: any;
  import = (opts: any) => {
    opts = misc.defaults(opts, {
      ipynb: {},
      new_id: undefined, // function that returns an unused id given
      // an is_available function; new_id(is_available) = a new id.
      existing_ids: [], // re-use these on loading for efficiency purposes
      output_handler: undefined, // h = output_handler(cell); h.message(...) -- hard to explain
      process_attachment: undefined
    }); // process attachments:  attachment(base64, mime) --> sha1

    this._ipynb = misc.deep_copy(opts.ipynb);
    this._new_id = opts.new_id;
    this._output_handler = opts.output_handler;
    this._process_attachment = opts.process_attachment;
    this._existing_ids = opts.existing_ids; // option to re-use existing ids

    this._handle_old_versions(); // must come before sanity checks, as old versions are "insane". -- see https://github.com/sagemathinc/cocalc/issues/1937
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
    delete this._cells;
    delete this._kernel;
    delete this._metadata;
    delete this._language_info;
    delete this._ipynb;
    delete this._existing_ids;
    delete this._new_id;
    delete this._output_handler;
    delete this._process_attachment;
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
    for (let worksheet of ipynb.worksheets || []) {
      for (let cell of worksheet.cells || []) {
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
          for (let mesg of cell.outputs) {
            if (mesg.output_type === "pyout") {
              for (let type of util.JUPYTER_MIMETYPES) {
                const b = type.split("/")[1];
                if (mesg[b] != null) {
                  const data = { [type]: mesg[b] };
                  for (let k in mesg) {
                    delete mesg[k];
                  }
                  mesg.data = data;
                  break;
                }
              }
              if (mesg.text != null) {
                const data = { "text/plain": mesg.text.join("") };
                for (let k in mesg) {
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
      this._ipynb.metadata.kerelspec &&
      this._ipynb.metadata.kernelspec.name;
  };

  _import_metadata = () => {
    const m = this._ipynb != null ? this._ipynb.metadata : undefined;
    if (m == null) {
      return;
    }
    const metadata: any = {};
    for (let k in m) {
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
      for (let t of util.JUPYTER_MIMETYPES) {
        const b = t.split("/")[1];
        if (content[b] != null) {
          content = { data: { [t]: content[b] } };
          break; // at most one data per message.
        }
      }
      if (content.text != null) {
        content = {
          data: { "text/plain": content.text },
          output_type: "stream"
        };
      }
    }
    return content;
  };

  _join_array_strings_obj = (obj: any) => {
    if (obj != null) {
      for (let key in obj) {
        const val = obj[key];
        if (misc.is_array(val)) {
          obj[key] = val.join("");
        }
      }
    }
    return obj;
  };

  // Mutate content to be of the format we use internally
  _import_cell_output_content = (content: any) => {
    content = this._update_output_format(content); // old versions
    this._join_array_strings_obj(content.data); // arrays --> strings
    if (misc.is_array(content.text)) {
      content.text = content.text.join("");
    }
    remove_redundant_reps(content.data); // multiple output formats
    delete content.prompt_number; // redundant; in some files
    return content;
  };

  _id_is_available = (id: any) => {
    return !(
      (this._cells != null ? this._cells[id] : undefined) ||
      (this._existing_ids != null ? this._existing_ids : []).includes(id)
    );
  };

  _get_new_id = () => {
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
    if ((outputs != null ? outputs.length : undefined) > 0) {
      let handler: any;
      const cell: any = { id, output: {} };
      if (this._output_handler != null) {
        handler = this._output_handler(cell);
      }
      for (let k in outputs) {
        // it's fine/good that k is a string here.
        let content = outputs[k];
        const cocalc_alt = alt_outputs != null ? alt_outputs[k] : undefined;
        if (cocalc_alt != null) {
          content = cocalc_alt;
        }
        this._import_cell_output_content(content);
        if (handler != null) {
          handler.message(content);
        } else {
          cell.output[k] = content;
        }
      }
      if (handler != null && typeof handler.done === "function") {
        handler.done();
      }
      return cell.output;
    } else {
      return null;
    }
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

  _import_cell(cell: any, n: any) {
    const id =
      (this._existing_ids != null ? this._existing_ids[n] : undefined) != null
        ? this._existing_ids != null
          ? this._existing_ids[n]
          : undefined
        : this._get_new_id();
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
        id
      ),
      cell_type: this._get_cell_type(cell.cell_type),
      exec_count: this._get_exec_count(cell.execution_count, cell.prompt_number)
    };

    if (cell.metadata != null) {
      for (let k of ["collapsed", "scrolled"]) {
        if (cell.metadata != null ? cell.metadata[k] : undefined) {
          obj[k] = !!(cell.metadata != null ? cell.metadata[k] : undefined);
        }
      }

      if ((cell.metadata != null ? cell.metadata.slideshow : undefined) != null) {
        obj.slide = cell.metadata.slideshow.slide_type;
      }

      if ((cell.metadata != null ? cell.metadata.tags : undefined) != null) {
        obj.tags = misc.dict(cell.metadata.tags.map(tag => [tag, true]));
      }
      const other = misc.copy_without(cell.metadata, [
        "collapsed",
        "scrolled",
        "slideshow",
        "tags"
      ]);
      if (misc.len(other) > 0) {
        obj.metadata = other;
      }
    }
    if (cell.attachments != null) {
      obj.attachments = {};
      for (let name in cell.attachments) {
        const val = cell.attachments[name];
        for (let mime in val) {
          const base64 = val[mime];
          if (this._process_attachment != null) {
            const sha1 = this._process_attachment(base64, mime);
            obj.attachments[name] = { type: "sha1", value: sha1 };
          } else {
            obj.attachments[name] = { type: "base64", value: base64 };
          }
        }
      }
    }
    return obj;
  }
}

export function remove_redundant_reps(data?: any) {
  if (data == null) {
    return;
  }
  // We only keep the first representation in types, since it provides the richest
  // representation in the client; there is no need for the others.
  // TODO: probably we should still store all of these types somewhere (in the
  // backend only) for the .ipynb export, but I'm not doing that right now!
  // This means opening and closing an ipynb file may lose information, which
  // no client currently cares about (?) -- maybe nbconvert does.
  let keep;
  for (let type of util.JUPYTER_MIMETYPES) {
    if (data[type] != null) {
      keep = type;
      break;
    }
  }
  if (keep != null) {
    for (let type in data) {
      if (type !== keep) {
        delete data[type];
      }
    }
  }
  return data;
}
