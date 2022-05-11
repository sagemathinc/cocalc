/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Use synctex to go back and forth between latex files and pdfs.
*/

import {
  path_split,
  splitlines,
  change_filename_extension,
} from "@cocalc/util/misc";
import { exec, ExecOutput, project_api } from "../generic/client";

interface SyncTex {
  [key: string]: string | number;
}

function exec_synctex(
  project_id: string,
  path: string,
  args: string[]
): Promise<ExecOutput> {
  return exec({
    timeout: 5,
    command: "synctex",
    args,
    project_id,
    path,
    err_on_exit: true,
  });
}

export async function pdf_to_tex(opts: {
  pdf_path: string;
  project_id: string;
  page: number; // 1-based page number
  x: number; // x-coordinate on page
  y: number; // y-coordinate on page,
  output_directory: string | undefined;
  src: string; // the "path" where the source file is
}): Promise<SyncTex> {
  const { head, tail } = path_split(opts.pdf_path);
  const path: string =
    opts.output_directory != null ? opts.output_directory : head;
  const args = ["edit", "-o", `${opts.page}:${opts.x}:${opts.y}:${tail}`];
  const output = await exec_synctex(opts.project_id, path, args);
  const info = parse_synctex_output(output.stdout);
  if (info.Input != null) {
    // Determine canonical path to source file
    // Unfortunately, we use a roundtrip back to the project again for this (slightly more latency, but more robust).
    const projectAPI = await project_api(opts.project_id);
    const inputOrig = `${info.Input}`;
    try {
      info.Input = await projectAPI.canonical_path(inputOrig);
    } catch (_) {
      // there are situations, where synctex claims the file extension is .Rnw, while in reality it is .rnw or whatever else
      // we use the path of the input file as a fallback. Usually, this should work fine.
      info.Input = opts.src;
    }
  }
  return info;
}

export async function tex_to_pdf(opts: {
  pdf_path: string;
  project_id: string;
  tex_path: string; // source tex file with given line/column
  line: number; // 1-based line number
  column: number; // 1-based column
  dir: string; // directory that contains the synctex file
  knitr: boolean;
  source_dir: string;
}): Promise<SyncTex> {
  if (opts.knitr) {
    opts.tex_path = change_filename_extension(opts.tex_path, "Rnw");
  }
  // TODO: obviously this should happen once -- not constantly!
  const HOME = await (
    await project_api(opts.project_id)
  ).eval_code("process.env.HOME");
  const output = await exec_synctex(opts.project_id, opts.dir, [
    "view",
    "-i",
    `${opts.line}:${opts.column}:${HOME}/${opts.source_dir}/${opts.tex_path}`,
    "-o",
    path_split(opts.pdf_path).tail,
  ]);
  return parse_synctex_output(output.stdout);
}

/* output.stdout looks something like this:

This is SyncTeX command line utility, version 1.2
SyncTeX result begin
Output:a.pdf
Page:1
x:164.955734
y:624.764160
h:116.581749
v:627.315674
W:378.084290
H:10.023508
before:
offset:0
middle:
after:
SyncTeX result end
*/

function parse_synctex_output(output: string): SyncTex {
  // see https://stackoverflow.com/questions/9011524/javascript-regexp-number-only-check for this regexp.
  const numberReSnippet =
    "(?:NaN|-?(?:(?:\\d+|\\d*\\.\\d+)(?:[E|e][+|-]?\\d+)?|Infinity))";
  const matchOnlyNumberRe = new RegExp("^(" + numberReSnippet + ")$");
  const BEGIN = "SyncTeX result begin";
  const END = "SyncTeX result end";
  const i = output.indexOf(BEGIN);
  if (i == -1) return {};
  const j = output.indexOf(END);
  if (j == -1) return {};
  const content = output.slice(i + BEGIN.length + 1, j - 1);
  const lines = splitlines(content);
  const parsed: SyncTex = {};
  for (const line of lines) {
    const [key, value] = line.split(":");
    if (value.match(matchOnlyNumberRe)) {
      parsed[key] = parseFloat(value);
    } else {
      parsed[key] = value;
    }
  }
  return parsed;
}
