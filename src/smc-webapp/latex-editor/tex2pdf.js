/*
Convert LaTeX file to PDF.
*/

import misc from "smc-util/misc";
const { required, defaults } = misc;
import { webapp_client } from "../webapp_client";

export function convert(opts) {
    opts = defaults(opts, {
        path: required,
        project_id: required,
        command: "latexmk", // alternative latex build line.
        args: [
            "-pdf",
            "-f",
            "-g",
            "-bibtex",
            "-synctex=1",
            "-interaction=nonstopmode"
        ],
        time: undefined, // when file was saved
        cb: required
    }); // cb(err, build output)
    const x = misc.path_split(opts.path);
    const args = misc.copy(opts.args).concat(x.tail);
    webapp_client.exec({
        allow_post: false, // definitely could take a long time to fully run latex
        timeout: 60,
        command: opts.command,
        args,
        project_id: opts.project_id,
        path: x.head,
        err_on_exit: false,
        aggregate: opts.time,
        cb: opts.cb
    });
}
