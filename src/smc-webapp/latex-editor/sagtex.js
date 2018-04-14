/*
Run sagetex
*/

import { required, defaults } = from "smc-util/misc";
import { webapp_client } from "../webapp_client";
import util from "./util";

export function sagetex(opts) {
    opts = defaults(opts, {
        path: required,
        project_id: required,
        time: undefined, // time to use for aggregate
        cb: required     // cb(err, build output)
    });

    let {base, directory} = util.parse_path(opts.path); // base, directory, filename
    let sagetex_file = base + ".sagetex.sage";
    return webapp_client.exec({
        allow_post: false, // definitely could take a long time to fully run sage
        timeout: 360,
        command: "sage",
        args: [sagetex_file],
        project_id: opts.project_id,
        path: directory,
        err_on_exit: false,
        aggregate: opts.time,
        cb: opts.cb
    });
}
