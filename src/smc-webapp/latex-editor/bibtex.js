/*
Run BibTex
*/

import { required, defaults } from "smc-util/misc";
import { webapp_client } from "../webapp_client";
import util from "./util";

export function bibtex(opts) {
    opts = defaults(opts, {
        path: required,
        project_id: required,
        time: undefined, // time to use for aggregate
        cb: required
    }); // cb(err, build output)

    const locals = util.parse_path(opts.path); // base, directory, filename
    webapp_client.exec({
        allow_post: false, // definitely could take a long time to fully run sage
        timeout: 15,
        command: "bibtex",
        args: [locals.base],
        project_id: opts.project_id,
        path: locals.directory,
        err_on_exit: false,
        aggregate: opts.time,
        cb: opts.cb
    });
}
