/*
Exporting from our in-memory sync-friendly format to ipynb
*/

import * as immutable from "immutable";
import * as misc from "../../smc-util/misc";

// In coffeescript still, so we at least say what we use of it here.
interface BlobStore {
  get_ipynb: (string) => string;
}

export function export_to_ipynb(opts: any) {
  opts = misc.defaults(opts, {
    cell_list: misc.required,
    cells: misc.required,
    metadata: undefined, // custom metadata only
    kernelspec: {}, // official jupyter will give an error on load without properly giving this (and ask to select a kernel)
    language_info: undefined,
    blob_store: undefined,
    more_output: undefined
  }); // optional map id --> list of additional output messages to replace last output message.

  const ipynb = {
    cells: opts.cell_list.toJS().map((id: string) => cell_to_ipynb(id, opts)),
    metadata: opts.metadata ? opts.metadata.toJS() || {} : {},
    nbformat: 4,
    nbformat_minor: 0
  };

  ipynb.metadata.kernelspec = opts.kernelspec;
  if (opts.language_info != null) {
    ipynb.metadata.language_info = opts.language_info.toJS() || {};
  }

  return ipynb;
}

// Return ipynb version of the given cell as object
function cell_to_ipynb(id: string, opts: any) {
  let left, left1, left2;
  const cell = opts.cells.get(id);
  const metadata: any = {};
  const obj: any = {
    cell_type: (left = cell.get("cell_type")) != null ? left : "code",
    source: diff_friendly((left1 = cell.get("input")) != null ? left1 : ""),
    metadata
  };

  // Handle any extra metadata (mostly user defined) that we don't handle in a special
  // way for efficiency reasons.
  const other_metadata = cell.get("metadata");
  if (other_metadata != null) {
    process_other_metadata(obj, other_metadata.toJS());
  }

  // consistenty with jupyter -- they explicitly give collapsed true or false state no matter what
  metadata.collapsed = !!cell.get("collapsed");

  // Jupyter only gives scrolled state when true.
  if (cell.get("scrolled")) {
    metadata.scrolled = true;
  }

  const exec_count = (left2 = cell.get("exec_count")) != null ? left2 : 0;
  if (obj.cell_type === "code") {
    obj.execution_count = exec_count;
  }

  process_slides(obj, cell.get("slide"));
  process_attachments(obj, cell.get("attachments"), opts.blob_store);
  process_tags(obj, cell.get("tags"));

  if (obj.cell_type !== "code") {
    // Code is the only cell type that is allowed to have an outputs field.
    return obj;
  }

  const output = cell.get("output");
  if ((output != null ? output.size : undefined) > 0) {
    obj.outputs = ipynb_outputs(
      output,
      exec_count,
      opts.more_output != null ? opts.more_output[id] : undefined,
      opts.blob_store
    );
  } else if (obj.outputs == null && obj.cell_type === "code") {
    obj.outputs = []; // annoying requirement of ipynb file format.
  }
  for (const n in obj.outputs) {
    const x = obj.outputs[n];
    if (x.cocalc != null) {
      // alternative version of cell that official Jupyter doesn't support can only
      // stored in the **cell-level** metadata, not output.
      if (metadata.cocalc == null) {
        metadata.cocalc = { outputs: {} };
      }
      metadata.cocalc.outputs[n] = x.cocalc;
      delete x.cocalc;
    }
  }
  return obj;
}

function process_slides(obj: any, slide: any) {
  if (slide != null) {
    obj.metadata.slideshow = { slide_type: slide };
  }
}

function process_tags(obj: any, tags: any) {
  if (tags != null) {
    // we store tags internally as an immutable js map (for easy
    // efficient add/remove), but .ipynb uses a list.
    obj.metadata.tags = misc.keys(tags.toJS()).sort();
  }
}

function process_other_metadata(obj: any, other_metadata: any) {
  if (other_metadata != null) {
    Object.assign(obj.metadata, other_metadata);
  }
}

function process_attachments(
  obj: any,
  attachments: any,
  blob_store: BlobStore | undefined
) {
  if (attachments == null || blob_store == null) {
    // don't have to or can't do anything (https://github.com/sagemathinc/cocalc/issues/4272)
    return;
  }
  obj.attachments = {};
  attachments.forEach((val: any, name: string) => {
    if (val.get("type") !== "sha1") {
      return; // didn't even upload
    }
    const sha1 = val.get("value");
    const base64 = blob_store.get_ipynb(sha1);
    let ext = misc.filename_extension(name);
    if (ext === "jpg") {
      ext = "jpeg";
    }
    obj.attachments[name] = { [`image/${ext}`]: base64 }; // TODO -- other types?
  });
}

function ipynb_outputs(
  output: any,
  exec_count: any,
  more_output: any,
  blob_store: BlobStore | undefined
) {
  // If the last message has the more_output field, then there may be
  // more output messages stored, which are not in the cells object.
  if (output && output.getIn([`${output.size - 1}`, "more_output"]) != null) {
    let n: number = output.size - 1;
    const cnt = (more_output && (more_output.length || 0)) || 0;
    if (cnt === 0) {
      // For some reason more output is not available for this cell.  So we replace
      // the more_output message by an error explaining what happened.
      output = output.set(
        `${n}`,
        immutable.fromJS({
          text: "WARNING: Some output was deleted.\n",
          name: "stderr"
        })
      );
    } else {
      // Indeed, the last message has the more_output field.
      // Before converting to ipynb, we remove that last message...
      output = output.delete(`${n}`);
      // Then we put in the known more output.
      for (const mesg of more_output) {
        output = output.set(`${n}`, immutable.fromJS(mesg));
        n += 1;
      }
    }
  }
  // Now, everything continues as normal.

  const outputs: any[] = [];
  if (output && output.size > 0) {
    for (let i = 0; i < output.size + 1; i++) {
      const output_n =
        output.get(`${i}`) != null ? output.get(`${i}`).toJS() : undefined;
      if (output_n != null) {
        process_output_n(output_n, exec_count, blob_store);
        outputs.push(output_n);
      }
    }
  }
  return outputs;
}

function process_output_n(
  output_n: any,
  exec_count: any,
  blob_store: BlobStore | undefined
) {
  if (output_n == null) {
    return;
  }
  if (output_n.exec_count != null) {
    delete output_n.exec_count;
  }
  if (output_n.text != null) {
    output_n.text = diff_friendly(output_n.text);
  }
  if (output_n.data != null) {
    for (let k in output_n.data) {
      const v = output_n.data[k];
      if (k.slice(0, 5) === "text/") {
        output_n.data[k] = diff_friendly(output_n.data[k]);
      }
      if (
        misc.startswith(k, "image/") ||
        k === "application/pdf" ||
        k === "iframe"
      ) {
        if (blob_store != null) {
          const value = blob_store.get_ipynb(v);
          if (value == null) {
            // The image is no longer known; this could happen if the user reverts in the history
            // browser and there is an image in the output that was not saved in the latest version.
            // TODO: instead return an error.
            return;
          }
          if (k === "iframe") {
            delete output_n.data[k];
            k = "text/html";
          }
          output_n.data[k] = value;
        } else {
          return; // impossible to include in the output without blob_store
        }
      }
    }
    output_n.output_type = "execute_result";
    if (output_n.metadata == null) {
      output_n.metadata = {};
    }
    output_n.execution_count = exec_count;
  } else if (output_n.name != null) {
    output_n.output_type = "stream";
    if (output_n.name === "input") {
      process_stdin_output(output_n);
    }
  } else if (output_n.ename != null) {
    output_n.output_type = "error";
  }
}

function process_stdin_output(output: any) {
  output.cocalc = misc.deep_copy(output);
  output.name = "stdout";
  output.text =
    output.opts.prompt + " " + (output.value != null ? output.value : "");
  delete output.opts;
  delete output.value;
}

// Transform a string s with newlines into an array v of strings
// such that v.join('') == s.
function diff_friendly(s: any) {
  if (typeof s !== "string") {
    // might already be an array or undefined.
    return s;
  }
  const v = s.split("\n");
  for (let i = 0; i < v.length - 1; i++) {
    v[i] += "\n";
  }
  if (v[v.length - 1] === "") {
    v.pop(); // remove last elt
  }
  return v;
}
