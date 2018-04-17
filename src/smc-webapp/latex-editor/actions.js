/*
LaTeX Editor Actions.
*/

const WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/LaTeX-Editor";

import { fromJS, Map } from "immutable";

import { Actions as BaseActions } from "../code-editor/actions";

import { latexmk } from "./latexmk";

import { sagetex } from "./sagetex";

import * as synctex from "./synctex";

import { bibtex } from "./bibtex";
import { webapp_client } from "../webapp_client";
import { clean } from "./clean";

import { LatexParser } from "./latex-log-parser";
import { update_gutters } from "./gutters";

import { pdf_path } from "./util";

const VIEWERS = ["pdfjs_canvas", "pdfjs_svg", "embed", "build_log"];

export class Actions extends BaseActions {
    _init(...args) {
        super._init(...args); // call the _init for the parent class
        if (!this.is_public) {
            // one extra thing after markdown.
            this._init_syncstring_value();
            this._init_latexmk();
            this._init_spellcheck();
        }
    }

    _init_latexmk() {
        this._syncstring.on("save-to-disk", time => {
            this._last_save_time = time;
            this.run_latexmk(time);
        });
        this.run_latexmk();
    }

    _raw_default_frame_tree() {
        if (this.is_public) {
            return { type: "cm" };
        } else {
            return {
                direction: "col",
                type: "node",
                first: {
                    type: "cm"
                },
                second: {
                    direction: "row",
                    type: "node",
                    first: {
                        type: "pdfjs_svg"
                    },
                    second: {
                        type: "error"
                    }
                }
            };
        }
    }

    run_latexmk(time) {
        this.run_latex(time, true);
    }

    async run_latex(time, all_steps = false) {
        if (time == null) {
            time = this._last_save_time;
        }
        this.set_status("Running LaTeX...");
        this.setState({ build_log: undefined });
        let output;
        try {
            output = await latexmk(this.project_id, this.path, time);
        } catch (err) {
            this.set_error(err);
            return;
        }
        this.set_status("");
        if (output && output.stdout) {
            output.parse = new LatexParser(output.stdout, {
                ignoreDuplicates: true
            }).parse();
        }
        this.set_build_log({ latex: output });
        if (output != null) {
            this.clear_gutter("Codemirror-latex-errors");
            update_gutters({
                path: this.path,
                log: output.parse,
                set_gutter: (line, component) => {
                    this.set_gutter_marker({
                        line,
                        component,
                        gutter_id: "Codemirror-latex-errors"
                    });
                }
            });
        }

        for (let x of VIEWERS) {
            this.set_reload(x);
        }
    }

    run_bibtex(time) {
        if (time == null) {
            time = this._last_save_time;
        }
        this.set_status("Running BibTeX...");
        bibtex({
            path: this.path,
            project_id: this.project_id,
            time,
            cb: (err, output) => {
                this.set_status("");
                if (err) {
                    this.set_error(err);
                }
                this.set_build_log({ bibtex: output });
            }
        });
    }

    run_sagetex(time) {
        if (time == null) {
            time = this._last_save_time;
        }
        this.set_status("Running SageTeX...");
        sagetex({
            path: this.path,
            project_id: this.project_id,
            time,
            cb: (err, output) => {
                this.set_status("");
                if (err) {
                    this.set_error(err);
                }
                this.set_build_log({ sagetex: output });
            }
        });
    }

    async synctex_pdf_to_tex(page, x, y) {
        this.set_status("Running SyncTex from pdf to tex...");
        try {
            let output = await synctex.pdf_to_tex({
                x,
                y,
                page,
                pdf_path: pdf_path(this.path),
                project_id: this.project_id
            });
            this.set_status("");
            console.log(output);
            this.setState({ synctex_pdf_to_tex: output });
        } catch (err) {
            console.warn("ERROR ", err);
            this.set_error(err);
        }
    }

    async synctex_tex_to_pdf(line, column, filename) {
        this.set_status("Running SyncTex from tex to pdf...");
        try {
            let output = await synctex.tex_to_pdf({
                line,
                column,
                tex_path: filename ? filename : this.path,
                pdf_path: pdf_path(this.path),
                project_id: this.project_id
            });
            this.set_status("");
            this.setState({ synctex_tex_to_pdf: output });
            console.log(output);
        } catch (err) {
            console.warn("ERROR ", err);
            this.set_error(err);
        }
    }

    set_build_log(obj) {
        let left;
        let build_log = this.store.get("build_log");
        if (!build_log) {
            build_log = Map();
        }
        for (let k in obj) {
            const v = obj[k];
            build_log = build_log.set(k, fromJS(v));
        }
        this.setState({ build_log });
    }

    run_clean(time) {
        let log = "";
        this.set_status("Cleaning up auxiliary files...");
        delete this._last_save_time;
        this.setState({ build_log: Map() });
        clean({
            path: this.path,
            project_id: this.project_id,
            log: s => {
                let left;
                log += s;
                let build_log = this.store.get("build_log");
                if (!build_log) {
                    build_log = Map();
                }
                this.setState({
                    build_log: build_log.set("clean", log)
                });
            },
            cb: err => {
                this.set_status("");
                if (err) {
                    this.set_error(err);
                }
            }
        });
    }

    build_action(action) {
        let now = webapp_client.server_time();
        switch (action) {
            case "recompile":
                this.run_latexmk(now);
            case "latex":
                this.run_latex(now);
            case "bibtex":
                this.run_bibtex(now);
            case "sagetex":
                this.run_sagetex(now);
            case "clean":
                this.run_clean();
            default:
                this.set_error(`unknown build action '${action}'`);
        }
    }

    help() {
        window.open(WIKI_HELP_URL, "_blank").focus();
    }
}
