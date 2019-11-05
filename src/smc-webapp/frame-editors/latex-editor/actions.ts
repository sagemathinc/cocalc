/*
LaTeX Editor Actions.
*/

const HELP_URL = "https://doc.cocalc.com/latex.html";

const VIEWERS: ReadonlyArray<string> = [
  "pdfjs_canvas",
  "pdfjs_svg",
  "pdf_embed",
  "build"
];

import * as CodeMirror from "codemirror";

import { fromJS, List, Map } from "immutable";
import { once } from "smc-util/async-utils";
import { project_api } from "../generic/client";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";
import {
  latexmk,
  build_command,
  Engine,
  get_engine_from_config
} from "./latexmk";
import { sagetex, sagetex_hash, sagetex_errors } from "./sagetex";
import { pythontex, pythontex_errors } from "./pythontex";
import { knitr, patch_synctex, knitr_errors } from "./knitr";
import * as synctex from "./synctex";
import { bibtex } from "./bibtex";
import { count_words } from "./count_words";
import { server_time, ExecOutput } from "../generic/client";
import { clean } from "./clean";
import { LatexParser, IProcessedLatexLog } from "./latex-log-parser";
import { update_gutters } from "./gutters";
import { pdf_path } from "./util";
import { KNITR_EXTS } from "./constants";
import { forgetDocument, url_to_pdf } from "./pdfjs-doc-cache";
import { FrameTree } from "../frame-tree/types";
import { Store } from "../../app-framework";
import { createTypedMap, TypedMap } from "../../app-framework/TypedMap";
import { print_html } from "../frame-tree/print";
import { raw_url } from "../frame-tree/util";
import {
  path_split,
  separate_file_extension,
  splitlines,
  startswith,
  change_filename_extension,
  sha1
} from "smc-util/misc2";
import { IBuildSpecs } from "./build";
const { open_new_tab } = require("smc-webapp/misc_page");

export interface BuildLog extends ExecOutput {
  parse?: IProcessedLatexLog;
}

export type BuildLogs = Map<string, Map<string, any>>;

interface ScrollIntoViewParams {
  page: number;
  y: number;
  id: string;
}

export const ScrollIntoViewRecord = createTypedMap<ScrollIntoViewParams>();
export type ScrollIntoViewMap = TypedMap<ScrollIntoViewParams>;

interface LatexEditorState extends CodeEditorState {
  build_logs: BuildLogs;
  sync: string;
  scroll_pdf_into_view: ScrollIntoViewMap;
  word_count: string;
  zoom_page_width: string;
  zoom_page_height: string;
  build_command: string | List<string>;
  knitr: boolean;
  knitr_error: boolean; // true, if there is a knitr problem
  // pythontex_error: boolean;  // true, if pythontex processing had an issue
}

export class Actions extends BaseActions<LatexEditorState> {
  public project_id: string;
  public store: Store<LatexEditorState>;
  private _last_sagetex_hash: string;
  private is_building: boolean = false;
  private ext: string = "tex";
  private knitr: boolean = false; // true, if we deal with a knitr file
  private filename_knitr: string; // .rnw or .rtex
  private bad_filename: boolean; // true, if the <filename.tex> can't be processed -- see #3230
  // optional engine configuration string -- https://github.com/sagemathinc/cocalc/issues/2839
  private engine_config: Engine | null | undefined = undefined;

  // The output_directory that will be used if we are building
  // and using an output directory.  NOTE: this is a /tmp
  // directory, which we do not explicitly clean up.  However,
  // it gets cleaned up when the project stops (in kucalc it
  // is a ramdisk), or by whatever tmp cleaner should probably
  // be installed (say for docker...).  At least the size
  // should be relatively small.
  public output_directory: string;

  private relative_paths: { [path: string]: string } = {};

  _init2(): void {
    if (!this.is_public) {
      this.init_bad_filename();
      this.init_ext_filename(); // safe to set before syncstring init
      this._init_syncstring_value();
      this.init_ext_path(); // must come after syncstring init
      this.init_latexmk();
      this._init_spellcheck();
      this.init_config();
      if (!this.knitr) {
        this.output_directory = `/tmp/${sha1(this.path)}`;
      }
    }
  }

  private init_bad_filename(): void {
    // #3230 two or more spaces
    // note: if there are additional reasons why a filename is bad, add it to the
    // alert msg in run_build.
    this.bad_filename = /\s\s+/.test(this.path);
  }

  private init_ext_filename(): void {
    /* number one reason to check is to detect .rnw/.rtex files */
    const ext = separate_file_extension(this.path).ext;
    if (ext) {
      this.ext = ext.toLowerCase();
      if (KNITR_EXTS.includes(this.ext)) {
        this.knitr = true;
        this.filename_knitr = this.path;
      }
    }
  }

  // conditionally overwrites parent Action class method
  get_spellcheck_path(): string {
    if (this.knitr) {
      return this.filename_knitr;
    } else {
      return super.get_spellcheck_path();
    }
  }

  private init_ext_path(): void {
    if (this.knitr) {
      // changing the path to the (to be generated) tex file makes everyting else
      // here compatible with the latex commands
      this.path = change_filename_extension(this.path, "tex");
      this.setState({ knitr: this.knitr, knitr_error: false });
    }
  }

  private is_likely_master(): boolean {
    if (this._syncstring == null || this._syncstring.get_state() != "ready") {
      return false;
    }
    const s = this._syncstring.to_str();
    return s && s.indexOf("\\document") != -1;
  }

  private init_latexmk(): void {
    const account: any = this.redux.getStore("account");

    this._syncstring.on("save-to-disk", () => {
      if (
        account &&
        account.getIn(["editor_settings", "build_on_save"]) &&
        this.is_likely_master()
      ) {
        // Only autobuild on save if there is a \\document* command.
        this.build("", false);
      }
    });
  }

  private async init_build_directive(): Promise<void> {
    // check if there is an engine configured
    // https://github.com/sagemathinc/cocalc/issues/2839
    if (this.engine_config !== undefined) return;

    // Wait until the syncstring is loaded from disk.
    if (this._syncstring.get_state() == "init") {
      await once(this._syncstring, "ready");
    }
    if (this._state == "closed") return;

    const s = this._syncstring.to_str();
    let line: string;
    for (line of splitlines(s)) {
      if (startswith(line, "% !TeX program =")) {
        const tokens = line.split("=");
        if (tokens.length >= 2) {
          this.engine_config = get_engine_from_config(tokens[1].trim());
          if (this.engine_config != null) {
            // Now set the build command to what is configured.
            this.set_build_command(
              build_command(
                this.engine_config,
                path_split(this.path).tail,
                this.knitr,
                this.output_directory
              )
            );
          }
          return;
        }
      }
    }
  }

  private async init_config(): Promise<void> {
    this.setState({ build_command: "" }); // empty means not yet initialized

    // .rnw/.rtex files: we aux-syncdb them, not the autogenerated .tex file
    const path: string = this.knitr ? this.filename_knitr : this.path;
    this._init_syncdb(["key"], undefined, path);

    // Wait for the syncdb to be loaded and ready.
    if (this._syncdb.get_state() == "init") {
      await once(this._syncdb, "ready");
      if (this._state == "closed") return;
    }

    // If the build command is NOT already
    // set in syncdb, we wait for file to load,
    // looks for "% !TeX program =", and if so
    // sets up the build command based on that:
    if (this._syncdb.get_one({ key: "build_command" }) == null) {
      await this.init_build_directive();
      if (this._state == "closed") return;
    }

    // Also, whenever the syncdb changes or loads, we load the build
    // command from there, if it is explicitly set there.  This takes
    // precedence over the "% !TeX program =".
    const set_cmd = (): void => {
      if (this._syncdb == null) throw Error("syncdb must be defined");
      const x = this._syncdb.get_one({ key: "build_command" });

      if (x !== undefined && x.get("value") !== undefined) {
        const cmd: List<string> | string = x.get("value");
        if (typeof cmd === "string") {
          // #3159
          if (cmd.length > 0) {
            this.setState({ build_command: cmd });
            return;
          }
        } else if (cmd.size > 0) {
          // It's an array so the output-directory option should be
          // set; however, it's possible it isn't in case this is
          // an old document that had the build_command set before
          // we implemented output directory support.
          const build_command: List<string> = this.ensure_output_directory(cmd);
          this.setState({ build_command });
          return;
        }
      }

      // fallback
      const default_cmd = build_command(
        this.engine_config || "PDFLaTeX",
        path_split(this.path).tail,
        this.knitr,
        this.output_directory
      );
      this.set_build_command(default_cmd);
    };

    set_cmd();
    this._syncdb.on("change", set_cmd);

    if (this.is_likely_master()) {
      // We now definitely have the build command set and the document loaded,
      // and it is likely a master latex file, so let's kick off our initial build.
      this.force_build();
    }
  }

  private ensure_output_directory(cmd: List<string>): List<string> {
    const has_output_dir = cmd.some(x => x.indexOf("-output-directory=") != -1);
    if (!has_output_dir && this.output_directory != null) {
      // no output directory option.
      return cmd.splice(
        cmd.size - 2,
        0,
        `-output-directory=${this.output_directory}`
      );
    } else {
      return cmd;
    }
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          direction: "row",
          type: "node",
          first: { type: "cm" },
          second: { type: "error" },
          pos: 0.7
        },
        second: {
          direction: "row",
          type: "node",
          first: { type: "pdfjs_canvas" },
          second: { type: "build" },
          pos: 0.7
        },
        pos: 0.5
      };
    }
  }

  check_for_fatal_error(): void {
    const build_logs: BuildLogs = this.store.get("build_logs");
    if (!build_logs) return;
    const errors = build_logs.getIn(["latex", "parse", "errors"]);
    if (errors === undefined || errors.size < 1) return;
    const last_error = errors.get(errors.size - 1);
    let s = last_error.get("message") + last_error.get("content");
    if (s.indexOf("no output PDF") != -1) {
      // parse out the most relevant part of message...
      let i = s.indexOf("Fatal error");
      if (i !== -1) {
        s = s.slice(i);
      }
      i = s.indexOf("!");
      if (i != -1) {
        s = s.slice(0, i + 1);
      }
      const err =
        "WARNING: It is not possible to generate a useful PDF file.\n" +
        s.trim();
      console.warn(err);
      this.set_error(err);
    }
  }

  _forget_pdf_document(): void {
    forgetDocument(
      url_to_pdf(
        this.project_id,
        this.path,
        this.store.unsafe_getIn(["reload", VIEWERS[0]])
      )
    );
  }

  close(): void {
    this._forget_pdf_document();
    super.close();
  }

  // supports the "Force Rebuild" button.
  async force_build(id?: string): Promise<void> {
    await this.build(id, true);
  }

  // Ensure that all files that are open on this client
  // and needed for building the main file are saved to disk.
  // TODO: this could get moved up to the base class, when
  // switch_to_files is moved.
  private async save_all(explicit: boolean): Promise<void> {
    const files = this.store.get("switch_to_files");
    if (files == null || files.size <= 1) {
      await this.save(explicit);
      return;
    }
    for (const path of files) {
      const actions = this.redux.getEditorActions(this.project_id, path);
      if (actions == null) continue;
      await (actions as BaseActions<CodeEditorState>).save(explicit);
    }
  }

  // used by generic framework.
  async build(id?: string, force: boolean = false): Promise<void> {
    if (id) {
      const cm = this._get_cm(id);
      if (cm) {
        cm.focus();
      }
    }
    if (this.is_building) {
      return;
    }
    this.is_building = true;
    try {
      await this.save_all(false);
      await this.run_build(this.last_save_time(), force);
    } finally {
      this.is_building = false;
    }
  }

  clean(): void {
    this.build_action("clean");
  }

  async run_build(time: number, force: boolean): Promise<void> {
    this.setState({ build_logs: Map() });

    if (this.bad_filename) {
      const err = `ERROR: It is not possible to compile this LaTeX file with the name '${this.path}'.
        Please modify the filename, such that it does **not** contain two or more consecutive spaces.`;
      this.set_error(err);
      return;
    }

    // for knitr related documents, we have to first build the derived tex file ...
    if (this.knitr) {
      await this.run_knitr(time, force);
      if (this.store.get("knitr_error")) return;
    }
    // update word count asynchronously
    const run_word_count = this.word_count(time, force);
    // update_pdf=false, because it is defered until the end
    await this.run_latex(time, force, false);
    // ... and then patch the synctex file to align the source line numberings
    if (this.knitr) {
      await this.run_patch_synctex(time, force);
    }

    const s = this.store.unsafe_getIn(["build_logs", "latex", "stdout"]);
    let update_pdf = true;
    if (typeof s == "string") {
      if (s.indexOf("sagetex.sty") != -1) {
        update_pdf = false;
        await this.run_sagetex(time, force);
      }
      if (s.indexOf("pythontex.sty") != -1 || s.indexOf("PythonTeX") != -1) {
        update_pdf = false;
        await this.run_pythontex(time, force);
      }
    }

    // we suppress a cycle of loading the PDF if sagetex or pythontex runs above
    // because these two trigger a rebuild and update_pdf on their own at the end
    if (update_pdf) {
      this.update_pdf(time, force);
    }

    // and finally, wait for word count to finish -- to make clear the whole operation is done
    await run_word_count;
  }

  async run_knitr(time: number, force: boolean): Promise<void> {
    let output: BuildLog;
    const status = s => this.set_status(`Running Knitr... ${s}`);
    status("");

    try {
      output = await knitr(
        this.project_id,
        this.filename_knitr,
        this.make_timestamp(time, force),
        status
      );
    } catch (err) {
      this.set_error(err);
      this.setState({ knitr_error: true });
      return;
    } finally {
      this.set_status("");
    }
    output.parse = knitr_errors(output).toJS();
    this.set_build_logs({ knitr: output });
    this.clear_gutter("Codemirror-latex-errors");
    update_gutters({
      path: this.filename_knitr,
      log: output.parse,
      set_gutter: (line, component) => {
        this.set_gutter_marker({
          line,
          component,
          gutter_id: "Codemirror-latex-errors"
        });
      }
    });
    this.setState({ knitr_error: output.parse.all.length > 0 });
  }

  async run_patch_synctex(time: number, force: boolean): Promise<void> {
    const status = s => this.set_status(`Running Knitr/Synctex... ${s}`);
    status("");
    try {
      await patch_synctex(
        this.project_id,
        this.path,
        this.make_timestamp(time, force),
        status
      );
    } catch (err) {
      this.set_error(err);
      return;
    } finally {
      this.set_status("");
    }
  }

  // Return the output directory that should actually be used
  // for latexmk, synctex, etc., commands.  This depends on
  // the configured build line.  This is NOT always just
  // this.output_directory.
  private get_output_directory(): string | undefined {
    if (this.knitr) return;
    const s: string | List<string> | undefined = this.store.get(
      "build_command"
    );
    if (!s) {
      return;
    }
    if (typeof s == "string") {
      if (s.indexOf("-output-directory") == -1) {
        // we aren't going to go so far as to
        // parse a changed output-directory option...
        // At least if there is no option, we just
        // assume no output directory.
        return;
      } else {
        return this.output_directory;
      }
    } else {
      // s is a List<string>
      for (const x of s.toJS()) {
        if (x.startsWith("-output-directory")) {
          return this.output_directory;
        }
      }
      return;
    }
  }

  async run_latex(
    time: number,
    force: boolean,
    update_pdf: boolean = true
  ): Promise<void> {
    let output: BuildLog;
    let build_command: string | string[];
    const timestamp = this.make_timestamp(time, force);
    const s: string | List<string> | undefined = this.store.get(
      "build_command"
    );
    if (!s) {
      return;
    }
    this.set_error("");
    this.set_build_logs({ latex: undefined });
    if (typeof s == "string") {
      build_command = s;
    } else {
      build_command = s.toJS();
    }
    const status = s => this.set_status(`Running Latex... ${s}`);
    status("");
    try {
      output = await latexmk(
        this.project_id,
        this.path,
        build_command,
        timestamp,
        status,
        this.get_output_directory()
      );
    } catch (err) {
      this.set_error(err);
      return;
    }
    this.set_status("");
    output.parse = new LatexParser(output.stdout, {
      ignoreDuplicates: true
    }).parse();
    this.set_build_logs({ latex: output });
    // TODO: knitr complicates multifile a lot, so we do
    // not support it yet.
    if (!this.knitr && output.parse.files != null) {
      this.set_switch_to_files(output.parse.files);
    }
    this.check_for_fatal_error();
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

    if (update_pdf) {
      this.update_pdf(time, force);
    }
  }

  private async set_switch_to_files(files: string[]): Promise<void> {
    let switch_to_files: string[];
    const cur = this.store.get("switch_to_files");
    if (cur != null) {
      // If there's anything already there during this session
      // we keep it...
      switch_to_files = cur.toJS();
    } else {
      switch_to_files = [];
    }

    let files1: string[];
    const dir = path_split(this.path).head;
    if (dir == "") {
      files1 = files;
    } else {
      files1 = [];
      for (let i = 0; i < files.length; i++) {
        if (!files[i].startsWith("/")) {
          files1.push(dir + "/" + files[i]);
        } else {
          files1.push(files[i]);
        }
      }
    }

    const files2 = await (await project_api(this.project_id)).canonical_paths(
      files1
    );
    for (let i = 0; i < files2.length; i++) {
      const path = files2[i];
      if (!path.startsWith("/")) {
        switch_to_files.push(path);
        this.relative_paths[path] = files[i];
      }
    }
    // sort and make unique.
    this.setState({
      switch_to_files: Array.from(new Set(switch_to_files)).sort()
    });
  }

  update_pdf(time: number, force: boolean): void {
    const timestamp = this.make_timestamp(time, force);
    // forget currently cached pdf
    this._forget_pdf_document();
    // ... before setting a new one for all the viewers,
    // which causes them to reload.
    for (const x of VIEWERS) {
      this.set_reload(x, timestamp);
    }
  }

  async run_bibtex(time: number, force: boolean): Promise<void> {
    this.set_status("Running BibTeX...");
    try {
      const output: BuildLog = await bibtex(
        this.project_id,
        this.path,
        this.make_timestamp(time, force),
        this.get_output_directory()
      );
      this.set_build_logs({ bibtex: output });
    } catch (err) {
      this.set_error(err);
    }
    this.set_status("");
  }

  async run_sagetex(time: number, force: boolean): Promise<void> {
    const status = s => this.set_status(`Running SageTeX... ${s}`);
    status("");
    // First compute hash of sagetex file.
    let hash: string = "";
    if (!force) {
      try {
        hash = await sagetex_hash(
          this.project_id,
          this.path,
          time,
          status,
          this.get_output_directory()
        );
        if (hash === this._last_sagetex_hash) {
          // no change - nothing to do except updating the pdf preview
          this.update_pdf(time, force);
          return;
        }
      } catch (err) {
        this.set_error(err);
        this.update_pdf(time, force);
        return;
      } finally {
        this.set_status("");
      }
    }

    let output: BuildLog | undefined;
    try {
      // Next run Sage.
      output = await sagetex(
        this.project_id,
        this.path,
        hash,
        status,
        this.get_output_directory()
      );
      // Now Run LaTeX, since we had to run sagetex, which changes
      // the sage output. This +1 forces re-running latex... but still dedups
      // it in case of multiple users.
      await this.run_latex(time + 1, force);
    } catch (err) {
      this.set_error(err);
      this.update_pdf(time, force);
    } finally {
      this._last_sagetex_hash = hash;
      this.set_status("");
    }

    if (output != null) {
      // process any errors
      output.parse = sagetex_errors(this.path, output).toJS();
      this.set_build_logs({ sagetex: output });
      // there is no line information in the sagetex errors (and no concordance info either),
      // hence we can't update the gutters.
    }
  }

  async run_pythontex(time: number, force: boolean): Promise<void> {
    let output: BuildLog;
    const status = s => this.set_status(`Running PythonTeX... ${s}`);
    status("");

    try {
      // Run PythonTeX
      output = await pythontex(
        this.project_id,
        this.path,
        time,
        force,
        status,
        this.get_output_directory()
      );
      // Now run latex again, since we had to run pythontex, which changes
      // the inserted snippets. This +1 forces re-running latex... but still dedups
      // it in case of multiple users.
      await this.run_latex(time + 1, force);
    } catch (err) {
      this.set_error(err);
      // this.setState({ pythontex_error: true });
      this.update_pdf(time, force);
      return;
    } finally {
      this.set_status("");
    }
    // this is similar to how knitr errors are processed
    output.parse = pythontex_errors(this.path, output).toJS();
    this.set_build_logs({ pythontex: output });
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
    // this.setState({ pythontex_error: output.parse.all.length > 0 });
  }

  async synctex_pdf_to_tex(page: number, x: number, y: number): Promise<void> {
    this.set_status("Running SyncTex...");
    try {
      const info = await synctex.pdf_to_tex({
        x,
        y,
        page,
        pdf_path: pdf_path(this.path),
        project_id: this.project_id,
        output_directory: this.get_output_directory()
      });
      this.set_status("");
      const line = info.Line;
      if (typeof line != "number") {
        // TODO: would be nicer to handle this at the source...
        throw Error("invalid synctex output (Line must be a number).");
      }
      if (typeof info.Input != "string") {
        throw Error("unable to determine source file");
      }

      this.goto_line_in_file(line, info.Input);
    } catch (err) {
      console.warn("ERROR ", err);
      this.set_error(err);
    }
  }

  public async goto_line_in_file(line: number, path: string): Promise<void> {
    if (path.indexOf("/.") != -1 || path.indexOf("./") != -1) {
      path = await (await project_api(this.project_id)).canonical_path(path);
    }
    if (this.knitr) {
      // #v0 will not support multifile knitr.
      this.programmatical_goto_line(line, true, true);
      return;
    }
    // Focus a cm frame so that we split a code editor below.
    //this.show_focused_frame_of_type("cm");
    // focus/show/open the proper file, then go to the line.
    const id = await this.switch_to_file(path);
    // TODO: go to appropriate line in this editor.
    const actions = this.redux.getEditorActions(this.project_id, path);
    if (actions == null) {
      throw Error(`actions for "${path}" must be defined`);
    }
    (actions as BaseActions).programmatical_goto_line(line, true, true, id);
  }

  _get_most_recent_pdfjs(): string | undefined {
    return this._get_most_recent_active_frame_id(
      node => node.get("type").indexOf("pdfjs") != -1
    );
  }

  async synctex_tex_to_pdf(
    line: number,
    column: number,
    filename: string
  ): Promise<void> {
    // First figure out where to jump to in the PDF.
    this.set_status("Running SyncTex from tex to pdf...");
    let info;
    const source_dir: string = path_split(this.path).head;
    let dir: string | undefined = this.get_output_directory();
    if (dir === undefined) {
      dir = source_dir;
    }
    try {
      info = await synctex.tex_to_pdf({
        line,
        column,
        dir,
        tex_path: filename,
        pdf_path: pdf_path(this.path),
        project_id: this.project_id,
        knitr: this.knitr,
        source_dir
      });
    } catch (err) {
      console.warn("ERROR ", err);
      this.set_error(err);
      return;
    } finally {
      this.set_status("");
    }
    // Next get a PDF to jump to.
    let pdfjs_id: string | undefined = this._get_most_recent_pdfjs();
    if (!pdfjs_id) {
      // no pdfjs preview, so make one
      // todo: maybe replace pdfjs_canvas by which pdfjs was most recently used...?
      this.split_frame("col", this._get_active_id(), "pdfjs_canvas");
      pdfjs_id = this._get_most_recent_pdfjs();
      if (!pdfjs_id) {
        throw Error("BUG -- there must be a pdfjs frame.");
      }
    }
    const full_id: string | undefined = this.store.getIn([
      "local_view_state",
      "full_id"
    ]);
    if (full_id && full_id != pdfjs_id) {
      this.unset_frame_full();
    }
    // Now show the preview in the right place.
    this.scroll_pdf_into_view(info.Page as number, info.y as number, pdfjs_id);
  }

  // Scroll the pdf preview frame with given id into view.
  scroll_pdf_into_view(page: number, y: number, id: string): void {
    this.setState({
      scroll_pdf_into_view: new ScrollIntoViewRecord({
        page: page,
        y: y,
        id: id
      })
    });
  }

  set_build_logs(obj: { [K in keyof IBuildSpecs]?: BuildLog }): void {
    let build_logs: BuildLogs = this.store.get("build_logs");
    if (!build_logs) {
      // may have already been closed.
      return;
    }
    let k: string;
    for (k in obj) {
      const v: BuildLog = obj[k];
      build_logs = build_logs.set(k, fromJS(v));
    }
    this.setState({ build_logs });
  }

  async run_clean(): Promise<void> {
    let log: string = "";
    this.setState({ build_logs: Map() });

    const logger = (s: string): void => {
      log += s + "\n";
      const build_logs: BuildLogs = this.store.get("build_logs");
      this.setState({
        build_logs: build_logs.set("clean", fromJS({ stdout: log }))
      });
    };

    this.set_status("Cleaning up auxiliary files...");
    try {
      await clean(
        this.project_id,
        this.path,
        this.knitr,
        logger,
        this.get_output_directory()
      );
    } catch (err) {
      this.set_error(`Error cleaning auxiliary files -- ${err}`);
    }
    this.set_status("");
  }

  async build_action(action: string, force?: boolean): Promise<void> {
    if (force === undefined) {
      force = false;
    }
    const now: number = server_time().valueOf();
    switch (action) {
      case "build":
        this.run_build(now, false);
        return;
      case "latex":
        this.run_latex(now, false);
        return;
      case "bibtex":
        this.run_bibtex(now, false);
        return;
      case "sagetex":
        this.run_sagetex(now, false);
        return;
      case "pythontex":
        this.run_pythontex(now, false);
        return;
      case "clean":
        this.run_clean();
        return;
      default:
        this.set_error(`unknown build action '${action}'`);
    }
  }

  make_timestamp(time: number, force: boolean): number {
    return force ? new Date().valueOf() : time || this.last_save_time();
  }

  async word_count(time: number, force: boolean): Promise<void> {
    // only run word count if at least one such panel exists
    if (!this._has_frame_of_type("word_count")) {
      return;
    }

    try {
      const timestamp = this.make_timestamp(time, force);
      const output = await count_words(this.project_id, this.path, timestamp);
      if (output.stderr) {
        const err = `Error:\n${output.stderr}`;
        this.setState({ word_count: err });
      } else {
        this.setState({ word_count: output.stdout });
      }
    } catch (err) {
      this.set_error(err);
    }
  }

  help(): void {
    open_new_tab(HELP_URL);
  }

  zoom_page_width(id: string): void {
    this.setState({ zoom_page_width: id });
  }

  zoom_page_height(id: string): void {
    this.setState({ zoom_page_height: id });
  }

  sync(id: string, editor_actions: Actions): void {
    const cm = editor_actions._cm[id];
    if (cm != null) {
      // Clicked the sync button from within an editor
      this.forward_search(cm, editor_actions.path);
    } else {
      // Clicked button associated to a a preview pane;
      // let the preview pane do the work.
      this.setState({ sync: id });
    }
  }

  private forward_search(cm: CodeMirror.Editor, path: string): void {
    const { line, ch } = cm.getDoc().getCursor();
    if (this.relative_paths[path] != null) {
      path = this.relative_paths[path];
    }
    this.synctex_tex_to_pdf(line, ch, path);
  }

  time_travel(opts: { path?: string; frame?: boolean }): void {
    // knitr case: point to editor file, not the generated tex
    // https://github.com/sagemathinc/cocalc/issues/3336
    if (this.knitr) {
      super.time_travel({ path: this.filename_knitr, frame: opts.frame });
    } else {
      super.time_travel(opts);
    }
  }

  download(id: string): void {
    const node = this._get_frame_node(id);
    if (!node) {
      throw Error(`BUG - no node with id "${id}"`);
    }
    if (node.get("type").indexOf("pdf") === -1) {
      throw Error("download button only implemented for pdf");
    }
    const path: string = pdf_path(this.path);
    this.redux
      .getProjectActions(this.project_id)
      .download_file({ path: path, log: true });
  }

  print(id: string): void {
    const node = this._get_frame_node(id);
    if (node == null) {
      throw Error(`BUG -- no node with id ${id}`);
    }
    const type: string = node.get("type");

    if (type == "cm") {
      super.print(id);
      return;
    }
    if (type.indexOf("pdf") != -1) {
      this.print_pdf();
      return;
    }
    throw Error(`BUG -- printing not implement for node of type ${type}`);
  }

  print_pdf(): void {
    print_html({ src: raw_url(this.project_id, pdf_path(this.path)) });
  }

  set_build_command(command: string | string[]): void {
    // I deleted the insane time:now in this syncdb set, since that would seem to generate
    // an insane amount of traffic (and I'm surprised it wouldn't generate a feedback loop)!
    this._syncdb.set({ key: "build_command", value: command });
    this._syncdb.commit();
    this.setState({ build_command: fromJS(command) });
  }

  // if id is given, switch that frame to edit the given path;
  // if not given, switch an existing cm editor (or find one if there
  // is already one pointed at this path.)
  async switch_to_file(path: string, id?: string): Promise<string> {
    if (id != null) {
      const node = this._get_frame_node(id);
      if (node == null) return id;
      if (node.get("path") == path) return id; // already done;
      // Change it:
      (this as any).code_editors.close_code_editor(id);
      this.set_frame_tree({ id, path });
      return id;
    }

    // Check if there is already a code editor frame with the given path.
    id = this.get_matching_frame({ path, type: "cm" });
    if (id) {
      // found one
      this.set_active_id(id);
      return id;
    }

    // Focus a cm frame so that we split a code editor below.
    id = this.show_focused_frame_of_type("cm");
    const node = this._get_frame_node(id);
    if (node == null) {
      throw Error("bug");
    }
    if (node.get("path") == path) return id; // already done.

    // quick hack for now before moving this code to base class.
    // We need to close the editor for the id first;
    // otherwise the old editor gets used.
    (this as any).code_editors.close_code_editor(id);
    this.set_frame_tree({ id, path });
    return id;
  }
}
