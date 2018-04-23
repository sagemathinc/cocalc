/*
LaTeX Editor Actions.
*/

const WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/LaTeX-Editor";

import { fromJS, Map } from "immutable";

//import { Actions as BaseActions } from "../code-editor/actions";
const BaseActions = require("../code-editor/actions").Actions;

import { latexmk } from "./latexmk";

import { sagetex } from "./sagetex";

import * as synctex from "./synctex";

import { bibtex } from "./bibtex";

import { server_time, ExecOutput } from "./async-utils";
import { clean } from "./clean.ts";

import { LatexParser, ProcessedLatexLog } from "./latex-log-parser.ts";

import { update_gutters } from "./gutters.tsx";

import { pdf_path } from "./util";

const VIEWERS = ["pdfjs_canvas", "pdfjs_svg", "embed", "build_log"];

// obviously will move when porting code-editor to TS...
interface FrameTree {
    direction?: string;
    type: string;
    first?: FrameTree;
    second?: FrameTree;
}

interface BuildLog extends ExecOutput {
    parse?: ProcessedLatexLog;
}

export class Actions extends BaseActions {
    private project_id: string;
    _init(...args): void {
        super._init(...args); // call the _init for the parent class
        if (!this.is_public) {
            // one extra thing after markdown.
            this._init_syncstring_value();
            this._init_latexmk();
            this._init_spellcheck();
        }
    }

    _init_latexmk(): void {
        this._syncstring.on("save-to-disk", time => {
            this._last_save_time = time;
            this.run_latexmk(time);
        });
        this.run_latexmk(new Date().valueOf());
    }

    _raw_default_frame_tree(): FrameTree {
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

    run_latexmk(time: number): void {
        this.run_latex(time);
    }

    async run_latex(time: number): Promise<void> {
        this.set_status("Running LaTeX...");
        this.setState({ build_log: undefined });
        let output: BuildLog;
        try {
            output = await latexmk(
                this.project_id,
                this.path,
                time || this._last_save_time
            );
        } catch (err) {
            this.set_error(err);
            return;
        }
        this.set_status("");
        output.parse = new LatexParser(output.stdout, {
            ignoreDuplicates: true
        }).parse();
        this.set_build_log({ latex: output });
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

        for (let x of VIEWERS) {
            this.set_reload(x);
        }
    }

    async run_bibtex(time: number): Promise<void> {
        this.set_status("Running BibTeX...");
        try {
            const output: BuildLog = await bibtex(
                this.project_id,
                this.path,
                time || this._last_save_time
            );
            this.set_build_log({ bibtex: output });
        } catch (err) {
            this.set_error(err);
        }
        this.set_status("");
    }

    async run_sagetex(time: number): Promise<void> {
        this.set_status("Running SageTeX...");
        try {
            const output: BuildLog = await sagetex(
                this.project_id,
                this.path,
                time || this._last_save_time
            );
            this.set_build_log({ sagetex: output });
        } catch (err) {
            this.set_error(err);
        }
        this.set_status("");
    }

    async synctex_pdf_to_tex(
        page: number,
        x: number,
        y: number
    ): Promise<void> {
        this.set_status("Running SyncTex...");
        try {
            let output: ExecOutput = await synctex.pdf_to_tex({
                x,
                y,
                page,
                pdf_path: pdf_path(this.path),
                project_id: this.project_id
            });
            this.set_status("");
            let i = output.stdout.indexOf("\nLine:");
            if (i == -1) {
                throw Error("Couldn't find line.");
            }
            let s = output.stdout.slice(i + 6);
            i = output.stdout.indexOf("\n");
            if (i != -1) {
                s = s.slice(0, i);
            }
            let line = parseInt(s);
            console.log('goto line', line);
            this.programmatical_goto_line(line, true, true);
            // TODO #v1: parse out the filename and open *that* file if need be...
        } catch (err) {
            console.warn("ERROR ", err);
            this.set_error(err);
        }
    }

    async synctex_tex_to_pdf(line, column, filename): Promise<void> {
        this.set_status("Running SyncTex from tex to pdf...");
        try {
            let output: ExecOutput = await synctex.tex_to_pdf({
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

    set_build_log(obj: {
        latex?: BuildLog;
        bibtex?: BuildLog;
        sagetex?: BuildLog;
    }): void {
        let build_log: Map<any, string> = this.store.get("build_log");
        if (!build_log) {
            build_log = Map();
        }
        let k: string;
        for (k in obj) {
            const v: BuildLog = obj[k];
            build_log = build_log.set(k, fromJS(v));
        }
        this.setState({ build_log });
    }

    async run_clean(): Promise<void> {
        let log: string = "";
        delete this._last_save_time;
        this.setState({ build_log: Map() });

        const logger = (s: string): void => {
            log += s + "\n";
            let build_log: Map<any, string> =
                this.store.get("build_log") || Map();
            this.setState({
                build_log: build_log.set("clean", log)
            });
        };

        this.set_status("Cleaning up auxiliary files...");
        try {
            await clean(this.project_id, this.path, logger);
        } catch (err) {
            this.set_error(`Error cleaning auxiliary files -- ${err}`);
        }
        this.set_status("");
    }

    async build_action(action: string): Promise<void> {
        let now: number = server_time().valueOf();
        switch (action) {
            case "recompile":
                this.run_latexmk(now);
                return;
            case "latex":
                this.run_latex(now);
                return;
            case "bibtex":
                this.run_bibtex(now);
                return;
            case "sagetex":
                this.run_sagetex(now);
                return;
            case "clean":
                this.run_clean();
                return;
            default:
                this.set_error(`unknown build action '${action}'`);
        }
    }

    help(): void {
        // TODO: call version that deals with popup blockers...
        const w = window.open(WIKI_HELP_URL, "_blank");
        if (w) {
            w.focus();
        }
    }

    zoom_page_width(id: string): void {
        this.setState({ zoom_page_width: id });
    }

    zoom_page_height(id: string): void {
        this.setState({ zoom_page_height: id });
    }

    sync(id: string): void {
        this.setState({ sync: id });
    }
}
