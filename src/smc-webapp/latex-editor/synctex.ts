/*
Use synctex to go back and forth between latex files and pdfs.
*/

import { path_split } from "./misc";
import { exec } from "./async-utils";

function exec_synctex(project_id:string, pdf_path:string, args:string[]) {
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
}) {
    return exec_synctex(opts.project_id, opts.pdf_path, [
        "edit",
        "-o",
        `${opts.page}:${opts.x}:${opts.y}:${opts.pdf_path}`
    ]);
}

export async function tex_to_pdf(opts: {
    pdf_path: string;
    project_id: string;
    tex_path: number; // source tex file with given line/column
    line: number; // 1-based line number
    column: number; // 1-based column
}) {
    return exec_synctex(opts.project_id, opts.pdf_path, [
        "view",
        "-i",
        `${opts.line}:${opts.column}:${opts.tex_path}`,
        "-o",
        opts.pdf_path
    ]);
}
