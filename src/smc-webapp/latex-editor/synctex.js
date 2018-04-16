/*
Use synctex to go back and forth between latex files and pdfs.
*/

import { required, defaults } from "smc-util/misc";
import { path_split } from "smc-util/misc";
import { exec } from "./async-utils";

function exec_synctex(opts, args) {
    return exec({
        allow_post: true, // synctex is FAST.
        timeout: 5,
        command: "synctex",
        args: args,
        project_id: opts.project_id,
        path: path_split(opts.pdf_path).head,
        err_on_exit: true
    });
}

export async function pdf_to_tex(opts) {
    opts = defaults(opts, {
        pdf_path: required,
        project_id: required,
        page: required /* 1-based page number */,
        x: required /* x-coordinate on page */,
        y: required /* y-coordinate on page */
    });
    return exec_synctex(opts, [
        "edit",
        "-o",
        `${opts.page}:${opts.x}:${opts.y}:${opts.pdf_path}`
    ]);
}

export async function tex_to_pdf(opts) {
    opts = defaults(opts, {
        pdf_path: required /* full location of the pdf file */,
        project_id: required,
        line: required /* 1-based line number */,
        column: required /* 1-based column */,
        tex_path: required /* source file with given line/column */
    });
    return exec_synctex(opts, [
        "view",
        "-i",
        `${opts.line}:${opts.column}:${opts.tex_path}`,
        "-o",
        opts.pdf_path
    ]);
}
