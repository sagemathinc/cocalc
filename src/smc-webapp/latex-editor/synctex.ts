/*
Use synctex to go back and forth between latex files and pdfs.
*/

import { path_split, splitlines } from "./misc";
import { exec, ExecOutput } from "./async-utils";

interface SyncTex {
    [key: string]: string | number;
}

function exec_synctex(
    project_id: string,
    pdf_path: string,
    args: string[]
): Promise<ExecOutput> {
    return exec({
        allow_post: true, // synctex is FAST.
        timeout: 5,
        command: "synctex",
        args: args,
        project_id: project_id,
        path: path_split(pdf_path).head,
        err_on_exit: true
    });
}

export async function pdf_to_tex(opts: {
    pdf_path: string;
    project_id: string;
    page: number; // 1-based page number
    x: number; // x-coordinate on page
    y: number; // y-coordinate on page
}): Promise<SyncTex> {
    let output = await exec_synctex(opts.project_id, opts.pdf_path, [
        "edit",
        "-o",
        `${opts.page}:${opts.x}:${opts.y}:${opts.pdf_path}`
    ]);
    return parse_synctex_output(output.stdout);
}

export async function tex_to_pdf(opts: {
    pdf_path: string;
    project_id: string;
    tex_path: number; // source tex file with given line/column
    line: number; // 1-based line number
    column: number; // 1-based column
}): Promise<SyncTex> {
    let output = await exec_synctex(opts.project_id, opts.pdf_path, [
        "view",
        "-i",
        `${opts.line}:${opts.column}:${opts.tex_path}`,
        "-o",
        opts.pdf_path
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
    const BEGIN = "SyncTeX result begin",
        END = "SyncTeX result end";
    const i = output.indexOf(BEGIN);
    if (i == -1) return {};
    const j = output.indexOf(END);
    if (j == -1) return {};
    const content = output.slice(i + BEGIN.length + 1, j - 1);
    const lines = splitlines(content);
    const parsed: SyncTex = {};
    for (let line of lines) {
        let [key, value] = line.split(":");
        if (value.match(matchOnlyNumberRe)) {
            parsed[key] = parseFloat(value);
        } else {
            parsed[key] = value;
        }
    }
    return parsed;
}
