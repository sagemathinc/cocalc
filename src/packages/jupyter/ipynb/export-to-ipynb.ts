/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Exporting from our in-memory sync-friendly format to ipynb
*/

import { deep_copy, keys, filename_extension } from "@cocalc/util/misc";

type CellType = "code" | "markdown" | "raw";

type Tags = { [key: string]: boolean };

interface Cell {
  cell_type?: CellType;
  input?: string;
  collapsed?: boolean;
  scrolled?: boolean;
  slide?;
  attachments?;
  tags?: Tags;
  output?: { [n: string]: OutputMessage };
  metadata?: Metadata;
  exec_count?: number;
}

type OutputMessage = any;

interface Metadata {
  collapsed?: boolean;
  scrolled?: boolean;
  cocalc?: {
    outputs: { [n: string]: any };
  };
  slideshow?;
  tags?: string[];
}

export interface IPynbCell {
  id: string;
  cell_type: CellType;
  source?: string[];
  metadata?: Metadata;
  execution_count?: number;
  outputs?: OutputMessage[];
}

interface BlobStore {
  getBase64: (sha1: string) => string | null | undefined | void;
}

interface Options {
  // list of id's fo the cells in the correct order
  cell_list: string[];
  // actual data of the cells
  cells: { [id: string]: Cell };
  // custom metadata only
  metadata?;
  // official jupyter will give an error on load without properly giving this (and ask to select a kernel)
  kernelspec?: object;
  language_info?: object;
  blob_store?: BlobStore;
  // optional map id --> list of additional output messages to replace last output message.
  more_output?: { [id: string]: OutputMessage[] };
}

// **WARNING: any input to export_to_ipynb function may be MUTATED!**
export function export_to_ipynb(opts: Options) {
  if (opts.kernelspec == null) {
    opts.kernelspec = {};
  }
  const ipynb = {
    cells: opts.cell_list.map((id: string) => cell_to_ipynb(id, opts)),
    metadata: opts.metadata ?? {},
    nbformat: 4,
    nbformat_minor: 4,
  };

  ipynb.metadata.kernelspec = opts.kernelspec;
  if (opts.language_info != null) {
    ipynb.metadata.language_info = opts.language_info;
  }

  return ipynb;
}

// Return ipynb version of the given cell as object
function cell_to_ipynb(id: string, opts: Options) {
  const cell = opts.cells[id];
  const metadata: Metadata = {};
  const obj = {
    id,
    cell_type: cell.cell_type ?? "code",
    source: diff_friendly(cell.input ?? ""),
    metadata,
  } as IPynbCell;

  // Handle any extra metadata (mostly user defined) that we don't
  // handle in a special way for efficiency reasons.
  const other_metadata = cell.metadata;
  if (other_metadata != null) {
    processOtherMetadata(obj, other_metadata);
  }

  // consistenty with jupyter -- they explicitly give collapsed true or false state no matter what
  metadata.collapsed = !!cell.collapsed;

  // Jupyter only gives scrolled state when true.
  if (cell.scrolled) {
    metadata.scrolled = true;
  }

  const exec_count = cell.exec_count ?? 0;
  if (obj.cell_type === "code") {
    obj.execution_count = exec_count;
  }

  processSlides(obj, cell.slide);
  processAttachments(obj, cell.attachments);
  processTags(obj, cell.tags);

  if (obj.cell_type !== "code") {
    // Code is the only cell type that is allowed to have an outputs field.
    return obj;
  }

  const output = cell.output;
  if (output != null) {
    obj.outputs = ipynbOutputs({
      output,
      exec_count,
      more_output: opts.more_output?.[id],
      blob_store: opts.blob_store,
    });
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

function processSlides(obj, slide?) {
  if (slide != null) {
    obj.metadata.slideshow = { slide_type: slide };
  }
}

function processTags(obj, tags?: Tags) {
  if (tags != null) {
    // we store tags internally as a map (for easy
    // efficient add/remove), but .ipynb uses a list.
    obj.metadata.tags = keys(tags).sort();
  }
}

function processOtherMetadata(obj, other_metadata) {
  if (other_metadata != null) {
    Object.assign(obj.metadata, other_metadata);
  }
}

function processAttachments(obj, attachments) {
  if (attachments == null) {
    // don't have to or can't do anything (https://github.com/sagemathinc/cocalc/issues/4272)
    return;
  }
  obj.attachments = {};
  for (const name in attachments) {
    const val = attachments[name];
    if (val.type !== "base64") {
      // we only handle this now
      return;
    }
    let ext = filename_extension(name);
    if (ext === "jpg") {
      ext = "jpeg";
    }
    obj.attachments[name] = { [`image/${ext}`]: val.value };
  }
}

function ipynbOutputs({
  output,
  exec_count,
  more_output,
  blob_store,
}: {
  output: { [n: string]: OutputMessage };
  exec_count: number;
  more_output?: OutputMessage[];
  blob_store?: BlobStore;
}) {
  // If the last message has the more_output field, then there may be
  // more output messages stored, which are not in the cells object.
  let len = objArrayLength(output);
  if (output[`${len - 1}`].more_output != null) {
    let n: number = len - 1;
    const cnt = more_output?.length ?? 0;
    if (cnt === 0 || more_output == null) {
      // For some reason more output is not available for this cell.  So we replace
      // the more_output message by an error explaining what happened.
      output[`${n}`] = {
        text: "WARNING: Some output was deleted.\n",
        name: "stderr",
      };
    } else {
      // Indeed, the last message has the more_output field.
      // Before converting to ipynb, we remove that last message...
      delete output[`${n}`];
      // Then we put in the known more output.
      for (const mesg of more_output) {
        output[`${n}`] = mesg;
        n += 1;
      }
    }
  }
  // Now, everything continues as normal.

  const outputs: OutputMessage[] = [];
  len = objArrayLength(output);
  if (output != null && len > 0) {
    for (let n = 0; n < len; n++) {
      const output_n = output?.[`${n}`];
      if (output_n != null) {
        processOutputN(output_n, exec_count, blob_store);
        outputs.push(output_n);
      }
    }
  }
  return outputs;
}

function objArrayLength(objArray) {
  if (objArray == null) {
    return 0;
  }
  let n = -1;
  for (const k in objArray) {
    const j = parseInt(k);
    if (j > n) {
      n = j;
    }
  }
  return n + 1;
}

function processOutputN(
  output_n: OutputMessage,
  exec_count: number,
  blob_store?: BlobStore,
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
      if (k.startsWith("image/") || k === "application/pdf" || k === "iframe") {
        if (blob_store != null) {
          const value = blob_store.getBase64(v);
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
      processStdinOutput(output_n);
    }
  } else if (output_n.ename != null) {
    output_n.output_type = "error";
  }
}

function processStdinOutput(output) {
  output.cocalc = deep_copy(output);
  output.name = "stdout";
  output.text = output.opts.prompt + " " + (output.value ?? "");
  delete output.opts;
  delete output.value;
}

// Transform a string s with newlines into an array v of strings
// such that v.join('') == s.
function diff_friendly(
  s: string | string[] | undefined | null,
): string[] | undefined | null {
  if (typeof s !== "string") {
    // might already be an array or undefined.
    if (s == null) {
      return undefined;
    }
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
