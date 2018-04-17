/*
Convert LaTeX file to PDF using latexmk.
*/

import { exec } from "./async-utils";
import { path_split } from "./misc";

export async function latexmk(
    project_id: string,
    path: string,
    time?: number // (ms since epoch)  used to aggregate multiple calls into one across all users.
) {
    const x = path_split(path);
    return await exec({
        allow_post: false, // definitely could take a long time to fully run latex
        timeout: 90,
        command: "latexmk",
        args: [
            "-pdf",
            "-f",
            "-g",
            "-bibtex",
            "-synctex=1",
            "-interaction=nonstopmode",
            x.tail
        ],
        project_id: project_id,
        path: x.head,
        err_on_exit: false,
        aggregate: time
    });
}
