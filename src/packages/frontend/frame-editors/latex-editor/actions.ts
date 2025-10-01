/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
LaTeX Editor Actions.
*/

// cSpell:ignore rtex cmdl ramdisk maketitle documentclass outdirflag latexer rescan

const MINIMAL = `\\documentclass{article}
\\title{Title}
\\author{Author}
\\begin{document}
\\maketitle
\\end{document}
`;

const HELP_URL = "https://doc.cocalc.com/latex.html";

// NOTE: These names are the keys in EDITOR_SPEC in editor.ts, not the type field
const VIEWERS = ["pdfjs_canvas", "pdf_embed", "build", "output"] as const;

import { delay } from "awaiting";
import * as CodeMirror from "codemirror";
import { fromJS, List, Map } from "immutable";
import { debounce, union } from "lodash";
import { normalize as path_normalize } from "path";

import { Store, TypedMap } from "@cocalc/frontend/app-framework";
import {
  TableOfContentsEntry,
  TableOfContentsEntryList,
} from "@cocalc/frontend/components";
import {
  Actions as BaseActions,
  CodeEditorState,
} from "@cocalc/frontend/frame-editors/code-editor/actions";
import { print_html } from "@cocalc/frontend/frame-editors/frame-tree/print";
import { FrameTree } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";
import {
  exec,
  project_api,
  server_time,
} from "@cocalc/frontend/frame-editors/generic/client";
import { open_new_tab } from "@cocalc/frontend/misc";
import { once } from "@cocalc/util/async-utils";
import { ExecOutput } from "@cocalc/util/db-schema/projects";
import {
  change_filename_extension,
  path_split,
  separate_file_extension,
  sha1,
  splitlines,
  startswith,
} from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
// import { ExecuteCodeOutputAsync } from "@cocalc/util/types/execute-code";
import { bibtex } from "./bibtex";
import { clean } from "./clean";
import { KNITR_EXTS } from "./constants";
import { count_words } from "./count_words";
import { update_gutters } from "./gutters";
import { knitr, knitr_errors, patch_synctex } from "./knitr";
import { IProcessedLatexLog, LatexParser } from "./latex-log-parser";
import {
  build_command,
  Engine,
  get_engine_from_config,
  latexmk,
} from "./latexmk";
import { forgetDocument, url_to_pdf } from "./pdfjs-doc-cache";
import { pythontex, pythontex_errors } from "./pythontex";
import { sagetex, sagetex_errors, sagetex_hash } from "./sagetex";
import * as synctex from "./synctex";
import { parseTableOfContents } from "./table-of-contents";
import {
  BuildLog,
  BuildLogs,
  BuildSpecName,
  IBuildSpecs,
  // JobInfos,
  ScrollIntoViewMap,
  ScrollIntoViewRecord,
} from "./types";
import { ensureTargetPathIsCorrect, pdf_path } from "./util";
import * as tree_ops from "../frame-tree/tree-ops";

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
  includeError?: string;
  build_command_hardcoded?: boolean; // if true, an % !TeX cocalc = ... directive sets the command via the document itself
  contents?: TableOfContentsEntryList; // table of contents data.
  switch_output_to_pdf_tab?: boolean; // used for SyncTeX to switch output panel to PDF tab
  output_panel_id_for_sync?: string; // stores the output panel ID for SyncTeX operations
  // job_infos: JobInfos;
  autoSyncInProgress?: boolean; // unified flag to prevent sync loops - true when any auto sync operation is in progress
}

export class Actions extends BaseActions<LatexEditorState> {
  public project_id: string;
  public store: Store<LatexEditorState>;
  private _last_sagetex_hash: string;
  private _last_syncstring_hash: number | undefined;
  private is_building: boolean = false;
  public word_count: (
    time: number,
    force: boolean,
    skipFramePopup?: boolean,
  ) => Promise<void>;
  private is_stopping: boolean = false; // if true, do not continue running any compile jobs
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
  public output_directory: string | undefined;

  private relative_paths: { [path: string]: string } = {};
  private canonical_paths: { [path: string]: string } = {};
  private parsed_output_log?: IProcessedLatexLog;

  private _last_sync_time = 0;

  // Auto-sync function for cursor position changes (forward sync: source → PDF)
  private async handle_cursor_sync_to_pdf(
    line: number,
    column: number,
    filename: string,
  ): Promise<void> {
    if (this.is_auto_sync_in_progress()) {
      return; // Prevent sync loops
    }

    this.set_auto_sync_in_progress(true);
    try {
      await this.synctex_tex_to_pdf(line, column, filename);

      // Fallback: Clear flag after timeout if viewport change doesn't happen
      setTimeout(() => {
        if (this.is_auto_sync_in_progress()) {
          this.set_auto_sync_in_progress(false);
        }
      }, 2000);

      // Note: The autoSyncInProgress flag will be cleared when PDF viewport actually changes
    } catch (error) {
      console.warn("Auto-sync forward search failed:", error);
      // Clear flag on error since viewport won't change
      this.set_auto_sync_in_progress(false);
    }
  }

  private output_directory_path(): string {
    return `/tmp/${sha1(this.path)}`;
  }

  _init2(): void {
    this.set_gutter = this.set_gutter.bind(this);
    if (!this.is_public) {
      this.init_bad_filename();
      this.init_ext_filename(); // safe to set before syncstring init
      this._init_syncstring_value();
      this.init_ext_path(); // must come after syncstring init
      this.init_latexmk();
      // This breaks browser spellcheck.
      // this._init_spellcheck();
      this.init_config();
      if (!this.knitr) {
        this.output_directory = this.output_directory_path();
      }
      this._syncstring.on(
        "change",
        debounce(this.updateTableOfContents.bind(this), 1500),
      );
      this._syncstring.on(
        "change",
        debounce(this.ensureNonempty.bind(this), 1500),
      );
    }
    this.word_count = reuseInFlight(this._word_count.bind(this));
  }

  // similar to jupyter, where an empty document is really
  // confusing, with latex we at least do something to
  // prevent having a truly empty document.
  private ensureNonempty() {
    if (this.store && !this.store.get("value")?.trim()) {
      this.set_value(MINIMAL);
      this.build();
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
      // changing the path to the (to be generated) tex file makes everything else
      // here compatible with the latex commands
      this.path = change_filename_extension(this.path, "tex");
      this.setState({ knitr: this.knitr, knitr_error: false });
    }
  }

  private is_likely_master(): boolean {
    if (this.not_ready()) return false;
    const s = this._syncstring.to_str();
    return s != null && s.indexOf("\\document") != -1;
  }

  private init_latexmk(): void {
    const account: any = this.redux.getStore("account");

    this._syncstring.on(
      "save-to-disk",
      reuseInFlight(async () => {
        if (this.not_ready()) return;
        const hash = this._syncstring.hash_of_saved_version();
        if (
          account &&
          account.getIn(["editor_settings", "build_on_save"]) &&
          this._last_syncstring_hash != hash
        ) {
          this._last_syncstring_hash = hash;
          // there are two cases: the parent "master" file triggers the build (usual case)
          // or an included dependency – i.e. where parent_file is set
          if (this.parent_file != null && this.parent_file != this.path) {
            const parent_actions = this.redux.getEditorActions(
              this.project_id,
              this.parent_file,
            ) as Actions;
            // we're careful, maybe getEditorActions returns something else ...
            await parent_actions?.build?.("", false);
          } else if (this.parent_file == null && this.is_likely_master()) {
            // also check is_likely_master, b/c there must be a \\document* command.
            await this.build("", false);
          }
        }
      }),
    );
  }

  public async rescan_latex_directive(): Promise<void> {
    // make this false since this is only called when user explicitly requests it, so it
    // should scan for all options.
    await this.init_build_directive(false);
  }

  /**
   * we check the first ~1000 lines for
   * % !TeX program = xelatex | pdflatex | ...
   * % !TeX cocalc = the exact command line
   */
  public async init_build_directive(cocalcOnly = false): Promise<void> {
    // check if there is an engine configured
    // https://github.com/sagemathinc/cocalc/issues/2839
    if (this.engine_config !== undefined) return;

    // Wait until the syncstring is loaded from disk.
    if (this._syncstring.get_state() == "init") {
      try {
        await once(this._syncstring, "ready");
      } catch {
        // closed before finished opening
        return;
      }
    }
    if (this._state == "closed") {
      return;
    }

    let program = ""; // later, might contain the !TeX program build directive
    let cocalc_cmd = ""; // later, might contain the cocalc command

    const s = this._syncstring.to_str();
    let line: string;
    let lineNo = 0;
    for (line of splitlines(s)) {
      lineNo += 1;
      if (lineNo > 1000) break;
      if (!startswith(line, "%")) continue;
      const i = line.indexOf("=");
      if (i == -1) continue;
      // we match on lower case and normalize all spaces
      const directive = line
        .slice(0, i)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (
        !cocalcOnly &&
        (startswith(directive, "% !tex program") ||
          startswith(directive, "% !tex ts-program"))
      ) {
        program = line.slice(i + 1).trim();
      } else if (startswith(directive, "% !tex cocalc")) {
        cocalc_cmd = line.slice(i + 1).trim();
      }
      if (cocalc_cmd || (cocalc_cmd && program)) break;
    }

    // cocalc command takes precedence!
    if (cocalc_cmd) {
      // once set, it will be sanitized upon the next syncdb change event
      this.set_build_command(cocalc_cmd);
      this.setState({ build_command_hardcoded: true });
    } else if (program) {
      // get_engine_from_config picks an "Engine" we know of via lower-case match
      this.engine_config = get_engine_from_config(program);
      if (this.engine_config != null) {
        // Now set the build command to what is configured.
        this.set_build_command(
          build_command(
            this.engine_config,
            path_split(this.path).tail,
            this.knitr,
            this.output_directory,
          ),
        );
      }
      this.setState({ build_command_hardcoded: false });
    } else {
      this.setState({ build_command_hardcoded: false });
    }
  }

  private async init_config(): Promise<void> {
    this.setState({ build_command: "" }); // empty means not yet initialized

    // .rnw/.rtex files: we aux-syncdb them, not the autogenerated .tex file
    const path: string = this.knitr ? this.filename_knitr : this.path;
    this._init_syncdb(["key"], undefined, path);

    // Wait for the syncdb to be loaded and ready.
    if (this._syncdb == null) {
      throw Error("syncdb must be defined");
    }
    if (this._syncdb.get_state() == "init") {
      try {
        await once(this._syncdb, "ready");
      } catch {
        // user closed it
        return;
      }
      if (this._state == "closed") return;
    }

    // If the build command is NOT already
    // set in syncdb, we wait for file to load,
    // looks for "% !TeX program =", and if so
    // sets up the build command based on that:
    if (this._syncdb == null) {
      throw Error("syncdb must be defined");
    }
    if (this._syncdb.get_one({ key: "build_command" }) == null) {
      await this.init_build_directive();
      if (this._state == "closed") return;
    } else {
      // this scans for the "cocalc" directive, which hardcodes the build command
      await this.init_build_directive(true);
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
            const build_command = this.sanitize_build_cmd_str(cmd);
            this.setState({ build_command });
            this.set_build_command(build_command);
            return;
          }
          // https://github.com/sagemathinc/cocalc/issues/6397
        } else if (List.isList(cmd) && cmd.size > 0) {
          // It's an array so the output-directory option should be
          // set; however, it's possible it isn't in case this is
          // an old document that had the build_command set before
          // we implemented output directory support.
          const build_command: List<string> = this.sanitize_build_cmd(cmd);
          this.setState({ build_command });
          this.set_build_command(build_command.toJS());
          return;
        }
      }

      // fallback
      this.set_default_build_command();
    };

    set_cmd();
    this._syncdb.on("change", set_cmd);

    if (this.is_likely_master()) {
      // We now definitely have the build command set and the document loaded,
      // and it is likely a master latex file, so let's kick off our initial build.
      this.force_build();
    }
  }

  private set_default_build_command(): string[] {
    const default_cmd = build_command(
      this.engine_config || "PDFLaTeX",
      path_split(this.path).tail,
      this.knitr,
      this.output_directory,
    );
    this.set_build_command(default_cmd);
    return default_cmd;
  }

  private output_directory_cmd_flag(output_dir?: string): string {
    // maybe at some point we want to wrap this in ''
    const dir = output_dir != null ? output_dir : this.output_directory;
    return `-output-directory=${dir}`;
  }

  public sanitize_build_cmd_str(cmd: string): string {
    if (cmd.indexOf(";") != -1) {
      // if there is a semicolon we allow anything...
      return cmd;
    }
    // This is when users manually set the command or possibly slightly edited it.
    // It's very important NOT to ignore the output directory part!!! See #5183,
    // where we see ignoring this leads to massive problems.

    // Make sure the output directory matches what we are actually using (the sha1 hash).
    const i = cmd.indexOf("-output-directory=");
    if (i != -1) {
      let j = cmd.indexOf(" ", i);
      if (j == -1) {
        // at the end
        j = cmd.length;
      }
      if (this.output_directory) {
        // ensure it is set properly
        if (
          cmd.slice(i + "-output-directory=".length, j) != this.output_directory
        ) {
          cmd =
            cmd.slice(0, i) +
            `-output-directory=${this.output_directory} ` +
            cmd.slice(j);
        }
      } else {
        // ensure it is NOT set since it will definitely break things
        cmd = cmd.slice(0, i) + cmd.slice(j);
      }
    }

    //console.log("before", { cmd });
    cmd = ensureTargetPathIsCorrect(cmd, path_split(this.path).tail);
    //console.log("after", { cmd });

    // We also focus on setting -deps for latexmk
    if (!cmd.trim().startsWith("latexmk")) return cmd;
    // -dependents- or -deps- ← don't shows the dependency list, we remove these
    // surrounded with spaces, to reduce changes of wrong matches
    for (const bad of [" -dependents- ", " -deps- "]) {
      if (cmd.indexOf(bad) !== -1) {
        cmd = cmd.replace(bad, " ");
      }
    }
    if (cmd.indexOf(" -deps ") !== -1) return cmd;
    const cmdl = cmd.split(" ");
    // assume latexmk -pdf [insert here] ...
    cmdl.splice(2, 0, "-deps");
    return cmdl.join(" ");
  }

  private sanitize_build_cmd(cmd: List<string>): List<string> {
    // special case "false", to disable processing
    if (cmd.get(0)?.startsWith("false")) {
      return cmd;
    }

    // Next, we ensure the output directory is correct.
    let outdir: string | undefined = undefined;
    let i: number = -1;
    for (const x of cmd) {
      i += 1;
      if (startswith(x, "-output-directory=")) {
        outdir = x;
        break;
      }
    }
    // only bother tweaking/adding the output directory, if it exists in the first place
    if (outdir != null) {
      if (this.output_directory != null) {
        // make sure it is right
        const should_be = this.output_directory_cmd_flag();
        if (outdir != should_be) {
          cmd = cmd.set(i, should_be);
        }
      } else {
        // remove it, if there is none set
        cmd = cmd.delete(i);
      }
    }

    // -dependents- or -deps- ← don't shows the dependency list, we remove these
    for (const bad of ["-dependents-", "-deps-"]) {
      const idx = cmd.indexOf(bad);
      if (idx !== -1) {
        cmd = cmd.delete(idx);
      }
    }
    // and then we make sure -deps or -dependents exists
    if (!cmd.some((x) => x === "-deps" || x === "-dependents")) {
      cmd = cmd.splice(3, 0, "-deps");
    }

    // Finally make sure the filename is right.
    const filename = path_split(this.path).tail;
    if (filename != cmd.get(cmd.size - 1)) {
      cmd = cmd.set(cmd.size - 1, filename);
    }

    return cmd;
  }

  // disable the output directory for pythontex and sagetex.
  // the main reason is that it is likely to process files, load py modules or generated images.
  // compiling tex in a tmp dir breaks all the paths. -- https://github.com/sagemathinc/cocalc/issues/4394
  // returns true, if it really made a change.
  private ensure_output_directory_disabled(): boolean {
    this.output_directory = undefined;

    // at this point we know that this.init_config already ran and set a build command
    if (this._syncdb == null) throw Error("syncdb must be defined");
    const x = this._syncdb.get_one({ key: "build_command" });
    if (x == null) return false; // should not happen

    const old_cmd: List<string> | string = x.get("value");
    let new_cmd: string[] | string =
      typeof old_cmd === "string" ? old_cmd : old_cmd.toJS();

    // fortunately, we know exactly what we have to remove
    const outdirflag = this.output_directory_cmd_flag(
      this.output_directory_path(),
    );

    let change = false;
    if (typeof old_cmd === "string") {
      const i = old_cmd.indexOf(outdirflag);
      if (i >= 0) {
        change = true;
        const before = old_cmd.slice(0, i);
        const after = old_cmd.slice(i + outdirflag.length);
        new_cmd = `${before}${after}`;
      }
    } else {
      const tmp = old_cmd.filter((x) => x != outdirflag);
      change = !tmp.equals(old_cmd);
      new_cmd = tmp.toJS();
    }

    //console.log("ensure_output_directory_disabled new_cmd", new_cmd, change);
    // don't wrap this in if-change, weird corner cases
    this.set_build_command(new_cmd);
    return change;
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        type: "node",
        direction: "col",
        first: {
          direction: "row",
          type: "node",
          first: { type: "cm" },
          second: {
            type: "node",
            direction: "col",
            first: { type: "latex_table_of_contents" },
            second: { type: "error" },
            pos: 0.3,
          },
          pos: 0.7,
        },
        second: {
          direction: "row",
          type: "node",
          first: { type: "pdfjs_canvas" },
          second: { type: "build" },
          pos: 0.7,
        },
        pos: 0.5,
      };
    }
  }

  _new_latex_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        type: "node",
        direction: "col",
        first: { type: "cm" },
        second: { type: "output" },
        pos: 0.5,
      };
    }
  }

  // Method to replace the entire frame tree with a custom tree structure
  replace_frame_tree_with_custom(customTree: FrameTree): void {
    let local = this.store.get("local_view_state");

    // Process the custom tree: assign IDs and ensure uniqueness
    let frame_tree = fromJS(customTree) as Map<string, any>;
    frame_tree = tree_ops.assign_ids(frame_tree);
    frame_tree = tree_ops.ensure_ids_are_unique(frame_tree);

    // Set the frame tree to the custom tree
    local = local.set("frame_tree", frame_tree);

    // Also make some id active, since existing active_id is no longer valid
    local = local.set("active_id", tree_ops.get_some_leaf_id(frame_tree));

    // Update state, so visible to UI
    this.setState({ local_view_state: local });

    // And save this new state to localStorage
    this.save_local_view_state();

    // Emit new-frame events for all leaf nodes
    for (const id in this._get_leaf_ids()) {
      const leaf = this._get_frame_node(id);
      if (leaf != null) {
        const type = leaf.get("type");
        this.store.emit("new-frame", { id, type });
      }
    }
  }

  check_for_fatal_error(): void {
    const build_logs: BuildLogs = this.store.get("build_logs");
    if (!build_logs) return;
    const errors = build_logs.getIn(["latex", "parse", "errors"]) as any;
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
        this.store.unsafe_getIn(["reload", VIEWERS[0]]),
      ),
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

  private all_actions(): BaseActions<CodeEditorState>[] {
    const files = this.store.get("switch_to_files");
    if (files == null || files.size <= 1) {
      return [this as BaseActions<CodeEditorState>];
    }
    const v: BaseActions<CodeEditorState>[] = [];
    for (const path of files) {
      const actions = this.redux.getEditorActions(
        this.project_id,
        path,
      ) as BaseActions<CodeEditorState>;
      if (actions == null) continue;
      // the parent (master) file is in the switch_to_files list!
      if (this.path != path) {
        actions.set_parent_file(this.path);
      }
      v.push(actions);
    }
    return v;
  }

  // Ensure that all files that are open on this client
  // and needed for building the main file are saved to disk.
  // TODO: this could get moved up to the base class, when
  // switch_to_files is moved.
  private async save_all(explicit: boolean): Promise<void> {
    for (const actions of this.all_actions()) {
      await actions.save(explicit);
    }
  }

  public async explicit_save() {
    const account = this.redux.getStore("account");
    if (
      !account?.getIn(["editor_settings", "build_on_save"]) ||
      !this.is_likely_master()
    ) {
      // kicks off a save of all relevant files
      // Obviously, do not make this save_all(true), because
      // that would end up calling this very function again
      // crashing the browser in an INFINITE RECURSION
      // (this was a bug for a while!).
      // Also, the save of the related files is NOT
      // explicit -- the user is only explicitly saving this
      // file.  Explicit save is mainly about deleting trailing
      // whitespace and launching builds.
      await this.save_all(false);
      return;
    }
    await this.build();
  }

  // used by generic framework – this is bound to the instance, otherwise "this" is undefined, hence
  // make sure to use an arrow function!
  build = async (id?: string, force: boolean = false): Promise<void> => {
    this.set_error("");
    this.set_status("");
    if (id) {
      const cm = this._get_cm(id);
      if (cm) {
        cm.focus();
      }
    }
    // initiating a build. if one is running & forced, we stop the build
    if (this.is_building) {
      if (force) {
        await this.stop_build();
      } else {
        return;
      }
    }
    this.is_building = true;
    try {
      await this.save_all(false);
      await this.run_build(this.last_save_time(), force);
    } catch (err) {
      this.set_error(`${err}`);
      // if there is an error, we issue a stop, but keep the build logs
      await this.stop_build();
    } finally {
      this.is_building = false;
    }
  };

  async clean(): Promise<void> {
    await this.build_action("clean");
  }

  private async kill(job: ExecOutput): Promise<ExecOutput> {
    if (job.type !== "async") return job;
    const { pid, status } = job;
    if (status === "running" && typeof pid === "number") {
      try {
        await exec(
          {
            project_id: this.project_id,
            // negative PID, to kill the entire process group
            command: `kill -9 -${pid}`,
            // bash:true is necessary. kill + array does not work. IDK why.
            bash: true,
            err_on_exit: false,
          },
          this.path,
        );
      } catch (err) {
        // likely "No such process", we just ignore it
      } finally {
        // set this build log to be no longer running
        job.status = "killed";
      }
    }
    return job;
  }

  // This stops all known jobs with a status "running" and resets the state.
  async stop_build(_id?: string) {
    const build_logs = this.store.get("build_logs");
    try {
      this.is_stopping = true;
      if (build_logs) {
        for (const [name, job] of build_logs) {
          // this.kill returns the job with a modified status, it's not the kill exec itself
          this.set_build_logs({ [name]: await this.kill(job.toJS()) });
        }
      }
    } finally {
      this.set_status("");
      this.is_building = false;
      this.is_stopping = false;
    }
  }

  private async run_build(time: number, force: boolean): Promise<void> {
    if (this.is_stopping) return;
    // reset state of build_logs, since it is a fresh start
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
    let run_word_count: any = null;
    if (this._has_frame_of_type("word_count")) {
      run_word_count = this.word_count(time, force);
    }
    // update_pdf=false, because it is deferred until the end
    await this.run_latex(time, force, false);
    // ... and then patch the synctex file to align the source line numberings
    if (this.knitr) {
      await this.run_patch_synctex(time, force);
    }

    const s = this.store.unsafe_getIn(["build_logs", "latex", "stdout"]);
    let update_pdf = true;
    if (typeof s == "string") {
      const is_sagetex = s.indexOf("sagetex.sty") != -1;
      const is_pythontex =
        s.indexOf("pythontex.sty") != -1 || s.indexOf("PythonTeX") != -1;
      if (is_sagetex || is_pythontex) {
        if (this.ensure_output_directory_disabled()) {
          // rebuild if build command changed
          await this.run_latex(time, true, false);
        }
        update_pdf = false;
        if (is_sagetex) {
          await this.run_sagetex(time, force);
        }
        // don't make this an else-if: audacious latexer might want to run both o_O
        if (is_pythontex) {
          await this.run_pythontex(time, force);
        }
      }
    }

    // we suppress a cycle of loading the PDF if sagetex or pythontex runs above
    // because these two trigger a rebuild and update_pdf on their own at the end
    if (update_pdf) {
      this.update_pdf(time, force);
    }

    if (run_word_count != null) {
      // and finally, wait for word count to finish -- to make clear the whole operation is done
      await run_word_count;
    }
  }

  private async run_knitr(time: number, force: boolean): Promise<void> {
    if (this.is_stopping) return;
    let output: BuildLog;
    const status = (s) => this.set_status(`Running Knitr... ${s}`);
    const set_job_info = (job) => this.set_build_logs({ knitr: job });
    status("");

    try {
      output = await knitr(
        this.project_id,
        this.filename_knitr,
        this.make_timestamp(time, force),
        status,
        set_job_info,
      );
    } catch (err) {
      this.set_error(err);
      this.setState({ knitr_error: true });
      return;
    } finally {
      this.set_status("");
    }
    output.parse = knitr_errors(output).toJS();
    this.merge_parsed_output_log(output.parse);
    this.set_build_logs({ knitr: output });
    this.update_gutters();
    this.setState({ knitr_error: output.parse?.errors?.length > 0 });
  }

  async run_patch_synctex(time: number, force: boolean): Promise<void> {
    // quotes around ${s} are just so codemirror doesn't syntax highlight the rest of this file:
    const status = (s) => this.set_status(`Running Knitr/Synctex... "${s}"`);
    status("");
    try {
      await patch_synctex(
        this.project_id,
        this.path,
        this.make_timestamp(time, force),
        status,
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
    const s: string | List<string> | undefined =
      this.store.get("build_command");
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

  private async run_latex(
    time: number,
    force: boolean,
    update_pdf: boolean = true,
  ): Promise<void> {
    if (this.is_stopping) return;
    let output: BuildLog;
    let build_command: string | string[];
    const timestamp = this.make_timestamp(time, force);
    const s: string | List<string> | undefined =
      this.store.get("build_command");
    if (!s) {
      return;
    }
    this.set_error("");
    this.set_build_logs({ latex: undefined });
    // this.set_job_infos({ latex: undefined });
    if (typeof s == "string") {
      build_command = s;
    } else {
      build_command = s.toJS();
    }
    const status = (s) => this.set_status(`Running Latex... ${s}`);
    const set_job_info = (job) => this.set_build_logs({ latex: job });

    status("");
    try {
      output = await latexmk(
        this.project_id,
        this.path,
        build_command,
        timestamp,
        status,
        this.get_output_directory(),
        set_job_info,
      );
      // console.log(output);
    } catch (err) {
      //console.info("LaTeX Editor/actions/run_latex error=", err);
      this.set_error(err);
      return;
    } finally {
      // In all cases, we want the status info to clear
      this.set_status("");
    }
    // resetting parsed_output_log is ok, even if we do two passes.
    // the reason is that in pythontex or sagetex there is a merge *after* this step.
    // therefore, resetting this here will get rid of then stale errors related to
    // missing tokens, because pythontex or sagetex just computed them.
    this.parsed_output_log = output.parse = new LatexParser(output.stdout, {
      ignoreDuplicates: true,
    }).parse();
    this.set_build_logs({ latex: output });
    // TODO: knitr complicates multi-file a lot, so we do
    // not support it yet.
    if (!this.knitr && this.parsed_output_log.deps != null) {
      this.set_switch_to_files(this.parsed_output_log.deps);
    }
    this.check_for_fatal_error();
    this.update_gutters();
    this.update_gutters_soon();

    if (update_pdf) {
      this.update_pdf(time, force);
    }
  }

  // this *merges* errors from log into an eventually already existing this.parsed_output_log
  // the whole point is to keep latex errors while we add additional errors from
  // pythontex, sagetex, etc.
  private merge_parsed_output_log(log: IProcessedLatexLog) {
    // easy case, never supposed to happen
    if (this.parsed_output_log == null) {
      this.parsed_output_log = log;
      return;
    }
    for (const key of ["errors", "warnings", "typesetting", "all"]) {
      const existing = this.parsed_output_log[key];
      log[key].forEach((error) => existing.push(error));
    }
    for (const key of ["files", "deps"]) {
      this.parsed_output_log[key] = union(
        this.parsed_output_log[key],
        log[key],
      );
    }
  }

  private async update_gutters_soon(): Promise<void> {
    await delay(500);
    if (this._state == "closed") return;
    this.update_gutters();
  }

  private update_gutters(): void {
    // Defer gutter updates to avoid React rendering conflicts
    setTimeout(() => {
      // if we pass in a parsed log, we don't clean the gutters
      // it is meant to add to what we already have, e.g. for PythonTeX
      if (this.parsed_output_log == null) return;
      this.clear_gutters();
      update_gutters({
        log: this.parsed_output_log,
        set_gutter: this.set_gutter,
        actions: this,
      });
    }, 0);
  }

  private clear_gutters(): void {
    for (const actions of this.all_actions()) {
      actions.clear_gutter("Codemirror-latex-errors");
    }
  }

  private set_gutter(path: string, line: number, component: any): void {
    const canon_path = this.get_canonical_path(path);
    if (canon_path != null) {
      path = canon_path;
    }
    const actions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    );
    if (actions == null) {
      return; // file not open
    }

    (actions as BaseActions<LatexEditorState>).set_gutter_marker({
      line,
      component,
      gutter_id: "Codemirror-latex-errors",
    });
  }

  // transform a relative path like file.tex or ./x/name.tex
  // to the canonical path
  private get_canonical_path(path: string): string {
    const norm = path_normalize(path);
    return this.canonical_paths[norm];
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

    // if we're not in the home directory, prefix it to all relative paths
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

    // get canonical path names for each file
    const api = await project_api(this.project_id);
    let files2;
    try {
      files2 = await api.canonical_paths(files1);
      this.setState({ includeError: "" });
    } catch (err) {
      // Safely convert error to string, handling undefined/null cases
      const errorMessage = err
        ? String(err)
        : "Unknown error checking included files";
      this.setState({ includeError: errorMessage });
      return;
    }

    // record all relative paths
    for (let i = 0; i < files2.length; i++) {
      const canon_path = files2[i];
      if (!canon_path.startsWith("/")) {
        switch_to_files.push(canon_path);
        const norm_path = path_normalize(files[i]);
        this.relative_paths[canon_path] = norm_path;
        this.canonical_paths[norm_path] = canon_path;
      }
    }
    // sort and make unique.
    this.setState({
      switch_to_files: Array.from(new Set(switch_to_files)).sort(),
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
        this.get_output_directory(),
      );
      this.set_build_logs({ bibtex: output });
    } catch (err) {
      this.set_error(err);
    }
    this.set_status("");
  }

  async run_sagetex(time: number, force: boolean): Promise<void> {
    if (this.is_stopping) return;
    const status = (s) => this.set_status(`Running SageTeX... ${s}`);
    const set_job_info = (job) => this.set_build_logs({ sagetex: job });
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
          this.get_output_directory(),
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
        this.get_output_directory(),
        set_job_info,
      );
      if (!output) throw new Error("Unable to run SageTeX.");
      if (output.stderr.indexOf("sagetex.VersionError") != -1) {
        // See https://github.com/sagemathinc/cocalc/issues/4432
        throw Error(
          "SageTex in CoCalc currently only works with the default version of Sage.  Delete ~/bin/sage and try again.",
        );
      }
      // Now Run LaTeX, since we had to run sagetex, which changes the sage output.
      // This +1 forces re-running latex... but still deduplicates it in case of multiple users.
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
      output.parse = sagetex_errors(path_split(this.path).tail, output).toJS();
      this.merge_parsed_output_log(output.parse);
      this.set_build_logs({ sagetex: output });
      // there is no line information in the sagetex errors (and no concordance info either),
      // hence we can't update the gutters.
    }
  }

  async run_pythontex(time: number, force: boolean): Promise<void> {
    if (this.is_stopping) return;
    let output: BuildLog;
    const status = (s) => this.set_status(`Running PythonTeX... ${s}`);
    const set_job_info = (job) => this.set_build_logs({ pythontex: job });
    status("");

    try {
      // Run PythonTeX
      output = await pythontex(
        this.project_id,
        this.path,
        time,
        force,
        status,
        this.get_output_directory(),
        set_job_info,
      );
      // Now run latex again, since we had to run pythontex, which changes the inserted snippets.
      // This +2 forces re-running latex... but still deduplicates it in case of multiple users. (+1 is for sagetex)
      await this.run_latex(time + 2, force);
    } catch (err) {
      this.set_error(err);
      // this.setState({ pythontex_error: true });
      this.update_pdf(time, force);
      return;
    } finally {
      this.set_status("");
    }
    // this is similar to how knitr errors are processed
    output.parse = pythontex_errors(path_split(this.path).tail, output).toJS();
    this.merge_parsed_output_log(output.parse);
    this.set_build_logs({ pythontex: output });
    this.update_gutters();
  }

  async synctex_pdf_to_tex(
    page: number,
    x: number,
    y: number,
    manual: boolean = false,
  ): Promise<void> {
    // Only check auto sync flag for automatic sync, not manual double-clicks
    if (!manual && this.is_auto_sync_in_progress()) {
      return; // Prevent sync loops
    }

    if (!manual) {
      this.set_auto_sync_in_progress(true);
    }
    this.set_status("Running SyncTex...");
    try {
      const info = await synctex.pdf_to_tex({
        x,
        y,
        page,
        pdf_path: pdf_path(this.path),
        project_id: this.project_id,
        output_directory: this.get_output_directory(),
        src: this.path,
      });
      const line = info.Line;
      if (typeof line != "number") {
        // TODO: would be nicer to handle this at the source...
        throw Error("invalid synctex output (Line must be a number).");
      }
      if (typeof info.Input != "string") {
        throw Error("unable to determine source file");
      }
      await this.goto_line_in_file(line, info.Input);
    } catch (err) {
      if (err.message.indexOf("ENOENT") != -1) {
        console.log("synctex_pdf_to_tex err:", err);
        // err is just a string exception, and I'm nervous trying
        // to JSON.parse it, so we'll do something less robust,
        // which should have a sufficiently vague message that
        // it is OK.  When you try to run synctex and the synctex
        // file is missing, you get an error with ENOENT in it...
        this.set_error(
          'Synctex failed to run.  Try "Force Rebuild" your project (use the Build frame) or retry once the build is complete.',
        );
        // Clear flag since sync failed (only for automatic sync)
        if (!manual) {
          this.set_auto_sync_in_progress(false);
        }
        return;
      }
      console.warn("ERROR ", err);
      this.set_error(err);
      // Clear flag since sync failed (only for automatic sync)
      if (!manual) {
        this.set_auto_sync_in_progress(false);
      }
    } finally {
      this.set_status("");
    }
  }

  public async goto_line_in_file(line: number, path: string): Promise<void> {
    if (path.indexOf("/.") != -1 || path.indexOf("./") != -1) {
      path = await (await project_api(this.project_id)).canonical_path(path);
    }
    if (this.knitr) {
      // #v0 will not support multi-file knitr.
      this.programmatically_goto_line(line, true, true);
      this.clear_auto_sync_after_cursor_move();
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
    (actions as BaseActions).programmatically_goto_line(line, true, true, id);

    this.clear_auto_sync_after_cursor_move();
  }

  // Clear auto sync flag after cursor has moved (backward sync completion)
  private clear_auto_sync_after_cursor_move(): void {
    // Only for automatic sync - manual sync doesn't set the flag
    if (this.is_auto_sync_in_progress()) {
      setTimeout(() => {
        this.set_auto_sync_in_progress(false);
      }, 200); // Give time for cursor to actually move
    }
  }

  // Check if auto-sync is enabled for any output panel
  private is_auto_sync_enabled(): boolean {
    const local_view_state = this.store.get("local_view_state");
    if (!local_view_state) return false;

    // Check all output panels for auto-sync enabled
    for (const [key, value] of local_view_state.entrySeq()) {
      // Only check output panels
      if (this._is_output_panel(key) && value) {
        const autoSyncEnabled =
          typeof value.get === "function"
            ? value.get("autoSyncEnabled")
            : value.autoSyncEnabled;
        if (autoSyncEnabled) {
          return true;
        }
      }
    }
    return false;
  }

  // Set auto sync in progress flag in state
  private set_auto_sync_in_progress(inProgress: boolean): void {
    this.setState({ autoSyncInProgress: inProgress });
  }

  // Check if auto sync is currently in progress
  private is_auto_sync_in_progress(): boolean {
    return this.store.get("autoSyncInProgress") ?? false;
  }

  // Handle cursor movement - called by BaseActions.set_cursor_locs
  public handle_cursor_move(locs: any[]): void {
    if (!this.is_auto_sync_enabled() || locs.length === 0) return;

    // Prevent duplicate sync operations
    if (this.is_auto_sync_in_progress()) return;

    // Throttle sync operations to prevent excessive calls (max once every 500ms)
    const now = Date.now();
    if (now - this._last_sync_time < 500) return;
    this._last_sync_time = now;

    // Get the primary cursor position (first in the array)
    const cursor = locs[0];
    if (typeof cursor?.y === "number" && typeof cursor?.x === "number") {
      // Trigger forward sync (source → PDF)
      this.handle_cursor_sync_to_pdf(cursor.y + 1, cursor.x, this.path); // y is 0-based, synctex expects 1-based
    }
  }

  _get_most_recent_pdfjs(): string | undefined {
    return this._get_most_recent_active_frame_id(
      (node) => node.get("type").indexOf("pdfjs") != -1,
    );
  }

  _get_most_recent_output_panel(): string | undefined {
    let result = this._get_most_recent_active_frame_id_of_type("output");
    console.log(
      "LaTeX: _get_most_recent_output_panel() via active history returning",
      result,
    );

    // If no recently active output panel found, look for any output panel
    if (!result) {
      result = this._get_any_frame_id_of_type("output");
      console.log("LaTeX: _get_any_frame_id_of_type() returning", result);
    }

    return result;
  }

  // Helper method to find any frame of the given type, regardless of activity history
  _get_any_frame_id_of_type(type: string): string | undefined {
    const tree = this._get_tree();
    const leaf_ids = tree_ops.get_leaf_ids(tree);

    for (const id in leaf_ids) {
      const node = tree_ops.get_node(tree, id);
      if (node && node.get("type") === type) {
        return id;
      }
    }
    return undefined;
  }

  // Switch output panel to PDF tab for SyncTeX
  _switch_output_panel_to_pdf(output_panel_id: string): void {
    // This will be handled by the output panel component
    // We set a state that the output panel can react to
    this.setState({
      switch_output_to_pdf_tab: true,
      output_panel_id_for_sync: output_panel_id,
    });
  }

  async synctex_tex_to_pdf(
    line: number,
    column: number,
    filename: string,
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
        source_dir,
      });
    } catch (err) {
      console.warn("ERROR ", err);
      this.set_error(err);
      return;
    } finally {
      this.set_status("");
    }
    // Next get a PDF to jump to.
    // First check if there's an output panel, which contains a PDF viewer
    let output_panel_id: string | undefined =
      this._get_most_recent_output_panel();
    let pdfjs_id: string | undefined;

    // console.log("LaTeX forward sync: output_panel_id =", output_panel_id);

    if (output_panel_id) {
      // There's an output panel - switch it to PDF tab and use it
      // console.log("LaTeX forward sync: Using output panel", output_panel_id);
      this._switch_output_panel_to_pdf(output_panel_id);
      pdfjs_id = output_panel_id;
    } else {
      // No output panel, look for standalone PDF viewer
      // console.log(
      //   "LaTeX forward sync: No output panel found, looking for standalone PDFJS",
      // );
      pdfjs_id = this._get_most_recent_pdfjs();
      if (!pdfjs_id) {
        // no pdfjs preview, so make one
        // console.log("LaTeX forward sync: Creating new PDFJS panel");
        this.split_frame("col", this._get_active_id(), "pdfjs_canvas");
        pdfjs_id = this._get_most_recent_pdfjs();
        if (!pdfjs_id) {
          throw Error("BUG -- there must be a pdfjs frame.");
        }
      }
    }
    const full_id: string | undefined = this.store.getIn([
      "local_view_state",
      "full_id",
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
      scroll_pdf_into_view: new ScrollIntoViewRecord({ page, y, id }),
    });
  }

  // Check if the given ID is an output panel
  _is_output_panel(id: string): boolean {
    const frame = this._get_frame_node(id);
    const frameType = frame?.get("type");
    return frameType === "output";
  }

  // Public method to save local view state (delegates to parent's debounced method)
  save_local_view_state(): void {
    (this as any)._save_local_view_state();
  }

  private set_build_logs(obj: { [K in keyof IBuildSpecs]?: BuildLog }): void {
    let build_logs: BuildLogs = this.store.get("build_logs") ?? Map();
    let k: BuildSpecName;
    for (k in obj) {
      const v: BuildLog | undefined = obj[k];
      if (v) {
        build_logs = build_logs.set(k, fromJS(v) as any as TypedMap<BuildLog>);
      } else {
        build_logs = build_logs.delete(k);
      }
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
        build_logs: build_logs.set(
          "clean",
          fromJS({ output: log }) as any as TypedMap<BuildLog>,
        ),
      });
    };

    this.set_status("Cleaning up auxiliary files...");
    try {
      await clean(
        this.project_id,
        this.path,
        this.knitr,
        logger,
        this.get_output_directory(),
      );
    } catch (err) {
      this.set_error(`Error cleaning auxiliary files -- ${err}`);
    }
    this.set_status("");
  }

  // TODO: is this used in any way besides build_action("clean") ?
  private async build_action(action: string, force?: boolean): Promise<void> {
    if (force === undefined) {
      force = false;
    }
    const now: number = server_time().valueOf();
    switch (action) {
      case "build":
        await this.run_build(now, false);
        return;
      case "latex":
        await this.run_latex(now, false);
        return;
      case "bibtex":
        await this.run_bibtex(now, false);
        return;
      case "sagetex":
        await this.run_sagetex(now, false);
        return;
      case "pythontex":
        await this.run_pythontex(now, false);
        return;
      case "clean":
        await this.run_clean();
        return;
      default:
        this.set_error(`unknown build action '${action}'`);
    }
  }

  // time 0 implies to take the last_save_time,
  make_timestamp(time: number, force: boolean): number {
    return force ? Date.now() : time || this.last_save_time();
  }

  private async _word_count(
    time: number,
    force: boolean,
    skipFramePopup: boolean = false,
  ): Promise<void> {
    // only run word count if at least one such panel exists or skipFramePopup is true
    if (!skipFramePopup) {
      this.show_recently_focused_frame_of_type("word_count");
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
      // Clicked button associated to a preview pane;
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

  download_pdf(): void {
    const path: string = pdf_path(this.path);

    // we use auto false and true, since the pdf may not exist, and we don't want
    // a **silent failure**.  With auto:false, the pdf appears in a new tab
    // and user has to click again to actually get it on their computer, but
    // auto:true makes it so it downloads automatically to avoid that click.
    // If there is an error, that is clear too.
    this.redux
      .getProjectActions(this.project_id)
      .download_file({ path, log: true, auto: false });
    this.redux
      .getProjectActions(this.project_id)
      .download_file({ path, log: false, auto: true });
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
    if (type.indexOf("pdf") != -1 || type === "output") {
      this.print_pdf();
      return;
    }
    throw Error(`BUG -- printing not implement for node of type ${type}`);
  }

  print_pdf(): void {
    print_html({ src: raw_url(this.project_id, pdf_path(this.path)) });
  }

  set_build_command(command: string | string[]): void {
    if (this._syncdb == null) throw Error("syncdb must be defined");
    // I deleted the insane time:now in this syncdb set, since that
    // would seem to generate an insane amount of traffic (and I'm
    // surprised it wouldn't generate a feedback loop)!
    this._syncdb.set({ key: "build_command", value: command });
    this._syncdb.commit();
    this.setState({ build_command: fromJS(command) });
  }

  // if id is given, switch that frame to edit the given path;
  // if not given, switch an existing cm editor (or find one if there
  // is already one pointed at this path.)
  public async switch_to_file(path: string, id?: string): Promise<string> {
    id = await super.switch_to_file(path, id);
    this.update_gutters_soon();
    return id;
  }

  public async show_table_of_contents(
    _id: string | undefined = undefined,
  ): Promise<void> {
    const id = this.show_focused_frame_of_type(
      "latex_table_of_contents",
      "col",
      true,
      1 / 3,
    );
    // the click to select TOC focuses the active id back on the notebook
    await delay(0);
    if (this._state === "closed") return;
    this.set_active_id(id, true);
  }

  public updateTableOfContents(force: boolean = false): void {
    if (this._state == "closed" || this._syncstring == null) {
      // no need since not initialized yet or already closed.
      return;
    }
    if (
      !force &&
      !this.get_matching_frame({ type: "latex_table_of_contents" }) &&
      !this.get_matching_frame({ type: "output" })
    ) {
      // There is no table of contents frame or output frame so don't update that info.
      return;
    }
    const contents = fromJS(
      parseTableOfContents(this._syncstring.to_str() ?? ""),
    ) as any;
    this.setState({ contents });
  }

  public async scrollToHeading(entry: TableOfContentsEntry): Promise<void> {
    const id = this.show_focused_frame_of_type("cm");
    if (id == null) return;
    this.programmatically_goto_line(parseInt(entry.id), true, true, id);
  }

  languageModelExtraFileInfo() {
    return "LaTeX";
  }

  chatgptCodeDescription(): string {
    return "Put any LaTeX you generate in the answer in a fenced code block with info string 'tex'.";
  }

  set_font_size(id: string, font_size: number): void {
    if (this._is_output_panel(id)) {
      // This is for the output panel UI, not a regular frame.
      // We store its font size in the local_view_state.
      const local_view_state = this.store.get("local_view_state");
      this.setState({
        local_view_state: local_view_state.setIn([id, "font_size"], font_size),
      });
      // Save the state change
      this.save_local_view_state();
    } else {
      super.set_font_size(id, font_size);
      this.update_gutters_soon();
    }
  }

  increase_font_size(id: string): void {
    if (this._is_output_panel(id)) {
      const font_size = this.store.getIn(
        ["local_view_state", id, "font_size"],
        14,
      );
      this.set_font_size(id, font_size + 1);
    } else {
      super.increase_font_size(id);
    }
  }

  decrease_font_size(id: string): void {
    if (this._is_output_panel(id)) {
      const font_size = this.store.getIn(
        ["local_view_state", id, "font_size"],
        14,
      );
      this.set_font_size(id, Math.max(2, font_size - 1));
    } else {
      super.decrease_font_size(id);
    }
  }
}
