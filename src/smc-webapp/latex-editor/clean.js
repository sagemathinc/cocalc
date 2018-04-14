/*
Clean up all aux files.
 */

import async from "async";

import misc from "smc-util/misc";
const { defaults, required } = misc;
import { webapp_client } from "../webapp_client";

export function clean(opts) {
    opts = defaults(opts, {
        project_id: required,
        path: required,
        log: required,
        cb: required
    });

    let { head, tail } = misc.path_split(opts.path);
    let base_filename = misc.separate_file_extension(tail).name;

    let EXT = [
        "aux",
        "log",
        "bbl",
        "fls",
        "synctex.gz",
        "sagetex.py",
        "sagetex.sage",
        "sagetex.sage.py",
        "sagetex.scmd",
        "sagetex.sout"
    ];
    EXT = EXT.map(E => `.${E}`);
    EXT.push("-concordance.tex");
    return async.series(
        [
            cb => {
                opts.log(
                    `Running 'latexmk -f -c ${base_filename}' in '${head}'...\n`
                );
                // needs to come before deleting the .log file!
                return webapp_client.exec({
                    command: "latexmk",
                    args: ["-f", "-c", base_filename],
                    project_id: opts.project_id,
                    path: head,
                    cb(err, output) {
                        if (output != null) {
                            opts.log(
                                output.stdout + "\n" + output.stderr + "\n"
                            );
                        }
                        if (err) {
                            opts.log(`${err}` + "\n");
                        }
                        return cb(err);
                    }
                });
            },
            cb => {
                // this in particular gets rid of the sagetex files
                const files = EXT.map(ext => base_filename + ext);
                // -f: don't complain when it doesn't exist
                // --: then it works with filenames starting with a "-"
                opts.log(`Removing ${files.join(", ")}...`);
                return webapp_client.exec({
                    command: "rm",
                    args: ["-v", "-f", "--"].concat(files),
                    project_id: opts.project_id,
                    path: head,
                    cb(err, output) {
                        if (output != null) {
                            opts.log(
                                output.stdout + "\n" + output.stderr + "\n"
                            );
                        }
                        if (err) {
                            opts.log(`${err}` + "\n\n");
                        }
                        return cb(err);
                    }
                });
            }
        ],
        err => {
            opts.log("done.");
            return opts.cb(err);
        }
    );
}
