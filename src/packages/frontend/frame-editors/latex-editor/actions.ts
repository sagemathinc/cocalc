/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
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
import { fromJS, List, Map as IMap } from "immutable";
import { debounce, union } from "lodash";
import { normalize as path_normalize } from "path";
import * as React from "react";

import {
  BookmarkMarker,
  ChatMarker,
  buildBlockInsertion,
  buildBookmarkLine,
  buildInlineInsertion,
  buildMarkerLine,
  generateBookmarkText,
  generateMarkerHash,
  lineHasTexContent,
  scanBookmarks,
  scanMarkers,
} from "./chat-markers";
import { createRoot, Root } from "react-dom/client";

import { Icon } from "@cocalc/frontend/components";
import { ChatMarkerGutter, ChatMarkerInlineTail } from "./chat-marker-gutter";
// Side-effect import: registers the "Insert chat marker" command + Insert-menu entry.
import "./chat-marker-command";
import {
  chatFile,
  getSideChatActions,
} from "@cocalc/frontend/frame-editors/generic/chat";
import { initChat } from "@cocalc/frontend/chat/register";
import { formerAnchorIdOf } from "@cocalc/frontend/chat/utils";

import { type AccountStore } from "@cocalc/frontend/account";
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
import { randomId } from "@cocalc/conat/names";
import {
  exec,
  getComputeServerId,
  project_api,
  server_time,
} from "@cocalc/frontend/frame-editors/generic/client";
import { BuildCoordinator } from "@cocalc/frontend/frame-editors/generic/build-coordinator";
import { open_new_tab } from "@cocalc/frontend/misc";
import { once } from "@cocalc/util/async-utils";
import { ExecOutput } from "@cocalc/util/db-schema/projects";
import {
  change_filename_extension,
  is_bad_latex_filename,
  path_split,
  separate_file_extension,
  sha1,
  splitlines,
  startswith,
} from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import * as tree_ops from "../frame-tree/tree-ops";
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
import type { SyncString } from "@cocalc/sync/editor/string/sync";
import { PDFWatcher } from "./pdf-watcher";
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
  ScrollIntoViewMap,
  ScrollIntoViewRecord,
} from "./types";
import { ensureTargetPathIsCorrect, pdf_path } from "./util";

const SYNCTEX_SOURCE_EXTS = [
  "tex",
  "latex",
  "sty",
  "cls",
  ...KNITR_EXTS,
] as const;

type HelpMeFixBuildStage = Exclude<BuildSpecName, "build" | "bibtex" | "clean">;

const HELP_ME_FIX_BUILD_STAGES = [
  "latex",
  "knitr",
  "sagetex",
  "pythontex",
] as const satisfies readonly HelpMeFixBuildStage[];
const MAX_HELP_ME_FIX_STDOUT_CHARS = 1200;
const MAX_HELP_ME_FIX_STDERR_CHARS = 1200;

function tailChars(value: string, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `...\n${value.slice(-maxChars)}`;
}

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
  // Path whose text the current `contents` was parsed from — master or a
  // sub-file. Tracked so `scrollToHeading` jumps inside the right file
  // (the TOC follows whichever .tex frame the user is focused on).
  contents_path?: string;
  switch_output_to_pdf_tab?: boolean; // used for SyncTeX to switch output panel to PDF tab
  output_panel_id_for_sync?: string; // stores the output panel ID for SyncTeX operations
  // job_infos: JobInfos;
  autoSyncInProgress?: boolean; // unified flag to prevent sync loops - true when any auto sync operation is in progress
  building?: boolean; // true while a build is actively running (mirrors is_building for redux consumers)
  // Chat anchor markers found in the master + open sub-files. Keyed by file
  // path, each value is a list of {hash, line, col} for every marker occurrence.
  chat_markers?: IMap<string, List<TypedMap<ChatMarker>>>;
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
  private buildCoordinator?: BuildCoordinator;
  private _lastBuiltTime?: number;
  private _buildWasStopped = false;
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
  private _pdf_watcher_init_token = 0;
  private _project_started_listener?: () => void;

  // PDF file watcher - watches directory for PDF file changes
  private pdf_watcher?: PDFWatcher;

  // Debounced version - initialized in _init2()
  update_pdf: (time: number, force: boolean) => void;

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
    // Debounce update_pdf with 500ms delay, trailing only, has to work when PDF watcher fires during the build
    this.update_pdf = debounce(this._update_pdf.bind(this), 500, {
      leading: false,
      trailing: true,
    });
    // Hydrate `switch_to_files` from the per-file local_view_state so the
    // title-bar file dropdown is populated on a fresh page load, before
    // the user has triggered a build. Master is always `this.path` — no
    // special marking is needed; `all_actions()` and the dropdown treat
    // the master as whichever entry equals `this.path`.
    this._hydrateSwitchToFiles();
    if (!this.is_public) {
      this.init_bad_filename();
      this.init_ext_filename(); // safe to set before syncstring init
      this._init_syncstring_value();
      this.init_ext_path(); // must come after syncstring init
      this.init_latexmk();
      // This breaks browser spellcheck.
      // this._init_spellcheck();
      // init_config is async — it must complete (setting build_command)
      // before the BuildCoordinator is created, otherwise a late-join
      // attempt may fire with an empty build_command and silently bail.
      this.init_config().then(() => {
        if (this._state === "closed") return;
        this._init_build_coordinator();
      });
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
      // Eagerly initialize the side-chat syncdb even if the chat frame
      // isn't open yet — otherwise gutter badges for `% chat: <hash>`
      // markers stay empty (no message counts, no unread dots) until the
      // user first opens the chat panel.  initChat is idempotent.
      initChat(this.project_id, chatFile(this.path));
      // Attach chat-marker scanner to the master. Sub-files are picked up
      // when `switch_to_files` changes — see below.
      this._attachChatMarkerScanner(
        this as BaseActions<CodeEditorState>,
        this.path,
      );
      // Refresh the TOC when the focused CM frame changes — the panel
      // follows whichever .tex the user is editing. Debounce matches the
      // existing master-syncstring hook so rapid frame swaps don't
      // thrash the parser.
      const reparseTocOnActiveChange = debounce(() => {
        if (this._state === "closed") return;
        this.updateTableOfContents();
      }, 200);
      let lastActiveTocPath: string | undefined;
      let lastOpenFilesKey: string | undefined;
      let lastCmShape: string | undefined;
      this.store.on("change", () => {
        // switch_to_files is recomputed after each build; refresh scanners
        // only when the set of open files actually changed — otherwise
        // every unrelated store mutation (focus, cursor, chat, build
        // state) would trigger O(n) work across every open sub-file.
        const openKey = this.all_actions()
          .map((a) => (a as any).path as string | undefined)
          .filter((p): p is string => !!p)
          .sort()
          .join("\n");
        if (openKey !== lastOpenFilesKey) {
          lastOpenFilesKey = openKey;
          this._refreshChatMarkerScanners();
        }
        // Detect focus changes between CM frames and re-parse the TOC
        // against the newly-active file. Using `_activeCmPath` here (not
        // `active_id`) means splits and focus-only changes within the
        // same file don't trigger a reparse.
        const active = this._activeCmPath();
        if (active !== lastActiveTocPath) {
          lastActiveTocPath = active;
          reparseTocOnActiveChange();
        }
        // Detect CM-shape changes — e.g. the user split a pane so the
        // same file is now displayed in two CM instances. When that
        // happens, run _ensureChatUI against every open path so the
        // newly-mounted CM gets its click handler, keybindings, gutter
        // icons, inline styling, and tail widgets. WeakSet dedup inside
        // the installers makes this cheap when nothing actually changed.
        const shape = this.all_actions()
          .map((a) => {
            const p = (a as any).path as string | undefined;
            const cm = (a as any)._cm ?? {};
            const ids = Object.keys(cm).sort().join(",");
            return `${p ?? ""}:${ids}`;
          })
          .sort()
          .join("|");
        if (shape !== lastCmShape) {
          lastCmShape = shape;
          for (const actions of this.all_actions()) {
            const p = (actions as any).path as string | undefined;
            if (!p) continue;
            this._ensureChatUI(p);
          }
        }
      });
      // Watch chat messages so we can flip inline markers to read-only once
      // a root message references the hash.
      void this._initChatAnchorLockListener();
      this._project_started_listener = () => {
        void this._handle_project_started();
      };
      this.redux
        .getProjectStore(this.project_id)
        .on("started", this._project_started_listener);
      void this._init_pdf_directory_watcher();
    }
    this.word_count = reuseInFlight(this._word_count.bind(this));
  }

  private async _handle_project_started(): Promise<void> {
    // The PDF preview may have tried to load while the project was still stopped
    // or starting. Once the project is actually running, re-arm the watcher and
    // force a fresh reload so the preview recovers without a full page refresh.
    await this._init_pdf_directory_watcher();
    this.update_pdf(server_time().valueOf(), true);
  }

  private _init_build_coordinator(): void {
    this.buildCoordinator = new BuildCoordinator(this.project_id, this.path, {
      join: async (aggregate, force) => {
        await this.run_build(aggregate ?? 0, force);
      },
      stop: () => this.stop_build(),
      isBuilding: () => this.is_building,
      setBuilding: (v) => {
        this.is_building = v;
        this.setState({ building: v });
        if (!v) {
          // When build finishes, clean up any stale running entries in build_logs.
          // This is especially important for joinBuild paths where the exec stream
          // may error without properly finalizing the build_logs entry.
          this.cleanupStaleBuildLogs();
          if (!this._buildWasStopped) {
            this._lastBuiltTime = this.last_save_time();
          }
        }
      },
      setError: (err) => this.set_error(err),
    });
  }

  // Watch the directory containing the PDF file for changes
  private async _init_pdf_directory_watcher(): Promise<void> {
    const pdfPath = pdf_path(this.path);
    const token = ++this._pdf_watcher_init_token;
    const pdf_watcher = new PDFWatcher(
      this.project_id,
      pdfPath,
      // We ignore the PDFs timestamp (mtime) and use last_save_time for consistency with build-triggered updates
      (_mtime: number, force: boolean) => {
        this.update_pdf(this.last_save_time(), force);
      },
      getComputeServerId({ project_id: this.project_id, path: this.path }),
    );
    await pdf_watcher.init();
    // If another watcher init started while we were awaiting, drop this one so
    // we don't keep multiple directory subscriptions alive for the same editor.
    if (token !== this._pdf_watcher_init_token) {
      pdf_watcher.close();
      return;
    }
    this.pdf_watcher?.close();
    this.pdf_watcher = pdf_watcher;
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
    // Shell injection prevention: single quotes break bash string interpolation
    // note: if there are additional reasons why a filename is bad, add it to the
    // alert msg in run_build.
    this.bad_filename = is_bad_latex_filename(this.path);
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
    const account: AccountStore = this.redux.getStore("account");

    this._syncstring.on(
      "save-to-disk",
      reuseInFlight(async () => {
        if (this.not_ready()) return;
        const hash = this._syncstring.hash_of_saved_version();
        if (
          account?.get("is_ready") &&
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
            await parent_actions?.auto_build("");
          } else if (this.parent_file == null && this.is_likely_master()) {
            // also check is_likely_master, b/c there must be a \\document* command.
            await this.auto_build("");
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
    if (this._state === "closed") {
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

  // Tri-state: true = file exists, false = confirmed absent, null = unknown/error (skip auto-build)
  private async outputFileExists(filePath: string): Promise<boolean | null> {
    try {
      const project_actions = this.redux.getProjectActions(this.project_id);
      if (project_actions == null) return null;
      const project_store = project_actions.get_store();
      if (project_store == null) return null;
      const csid = getComputeServerId({
        project_id: this.project_id,
        path: this.path,
      });
      const { head: dir, tail: filename } = path_split(filePath);
      await project_actions.fetch_directory_listing({
        path: dir,
        compute_server_id: csid,
      });
      const dir_listings = project_store.getIn(["directory_listings", csid]);
      if (dir_listings == null) return null;
      const listing = dir_listings.get(dir ?? "");
      if (listing == null) return null;
      return listing.some((entry) => entry.get("name") === filename);
    } catch {
      return null;
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
      if (this._state === "closed") return;
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
      if (this._state === "closed") return;
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
      // Only build on open if:
      // - account settings are confirmed loaded (is_ready)
      // - build_on_save is enabled
      // - output PDF does not yet exist (null = unknown => skip)
      const account: AccountStore = this.redux.getStore("account");
      if (!account) return;
      const ready = await account.waitUntilReady();
      if (this._state === "closed") return;
      if (!ready) return; // timed out — settings not loaded, skip auto-build
      const buildOnSave =
        account.getIn(["editor_settings", "build_on_save"]) ?? true;
      if (!buildOnSave) return;
      const pdfExists = await this.outputFileExists(pdf_path(this.path));
      if (this._state === "closed") return;
      if (pdfExists !== false) return; // exists or unknown => don't build
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

  // this was the default until we made the new output.tsx one-stop-shop panel the default
  _classic_frame_tree_layout(): FrameTree {
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

  _new_frame_tree_layout(): FrameTree {
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

  // Override to make new layout the default
  _raw_default_frame_tree(): FrameTree {
    return this._new_frame_tree_layout();
  }

  // Frame types (EDITOR_SPEC keys) that already display build errors.
  // https://github.com/sagemathinc/cocalc/issues/8659
  private static ERROR_DISPLAY_FRAMES = ["output", "build", "error"] as const;

  private hasErrorDisplayFrame(): boolean {
    try {
      const tree = this._get_tree();
      for (const id in this._get_leaf_ids()) {
        const node = tree_ops.get_node(tree, id);
        if (
          node != null &&
          (Actions.ERROR_DISPLAY_FRAMES as readonly string[]).includes(
            node.get("type"),
          )
        ) {
          return true;
        }
      }
    } catch {}
    return false;
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
      // Only show toast if no error-displaying frame is visible —
      // if one is, the user can already see the problem there.
      if (!this.hasErrorDisplayFrame()) {
        this.set_error(err);
      }
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
    this._pdf_watcher_init_token += 1;
    this._forget_pdf_document();
    for (const handle of Object.values(this._chatMarkerScanners)) {
      handle.dispose();
    }
    this._chatMarkerScanners = {};
    // Tear down every per-path chat/bookmark artifact. Collect keys
    // first since `_disposeChatStateForPath` mutates the underlying
    // maps as it runs.
    const chatPaths = new Set<string>([
      ...Object.keys(this._chatTextMarkers),
      ...Object.keys(this._chatDeleteBookmarks),
      ...Object.keys(this._chatGutterHosts),
      ...Object.keys(this._chatBookmarkGutterHosts),
      ...Object.keys(this._chatCursorInsertHosts),
    ]);
    for (const path of chatPaths) {
      this._disposeChatStateForPath(path);
    }
    this._chatStoreDispose?.();
    this._chatStoreDispose = undefined;
    this.buildCoordinator?.close();
    if (this._project_started_listener != null) {
      this.redux
        .getProjectStore(this.project_id)
        .removeListener("started", this._project_started_listener);
      this._project_started_listener = undefined;
    }
    if (this.pdf_watcher != null) {
      this.pdf_watcher.close();
      this.pdf_watcher = undefined;
    }
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

  private async buildInternal(
    id: string | undefined,
    force: boolean,
    useFreshAggregate: boolean,
  ): Promise<void> {
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
    const buildId = randomId();
    // Capture before reset: if previous build was stopped, we need a fresh
    // timestamp to bypass backend aggregate dedup (cached partial results).
    const wasStopped = this._buildWasStopped;
    this.is_building = true;
    this._buildWasStopped = false;
    this.setState({ building: true });
    this.buildCoordinator?.setLocalBuildId(buildId);
    try {
      await this.save_all(false);
      const time =
        force || wasStopped || useFreshAggregate
          ? server_time().valueOf()
          : this.last_save_time();
      // Skip if nothing changed since last build — avoids DKV chatter that
      // causes other clients to flicker their build spinner for a no-op.
      // Must be AFTER save so last_save_time() reflects pending edits.
      if (
        !force &&
        !useFreshAggregate &&
        this._lastBuiltTime != null &&
        time === this._lastBuiltTime
      ) {
        return; // finally block cleans up is_building / building state
      }
      this.buildCoordinator?.publishBuildStart(buildId, time, force);
      await this.run_build(time, force);
      if (!this._buildWasStopped) {
        this._lastBuiltTime = this.last_save_time();
      }
    } catch (err) {
      this.set_error(`${err}`);
      // if there is an error, we issue a stop, but keep the build logs
      await this.stop_build();
    } finally {
      this.buildCoordinator?.publishBuildFinished(buildId);
      this.is_building = false;
      this.setState({ building: false });
    }
  }

  // used by generic framework – this is bound to the instance, otherwise "this" is undefined, hence
  // make sure to use an arrow function!
  build = async (id?: string, force: boolean = false): Promise<void> => {
    await this.buildInternal(id, force, true);
  };

  private async auto_build(id?: string): Promise<void> {
    await this.buildInternal(id, false, false);
  }

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
    this.buildCoordinator?.requestStop();
    // A stopped build didn't complete — clear the "last built" time so
    // the next build isn't skipped as a no-op.
    this._lastBuiltTime = undefined;
    this._buildWasStopped = true;
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
      this.setState({ building: false });
      this.is_stopping = false;
    }
  }

  private async run_build(time: number, force: boolean): Promise<void> {
    if (this.is_stopping) return;
    // reset state of build_logs, since it is a fresh start
    this.setState({ build_logs: IMap() });

    if (this.bad_filename) {
      const err = `ERROR: It is not possible to compile this LaTeX file with the name '${this.path}'.
        Please modify the filename, such that it does **not** contain two or more consecutive spaces or single quotes (').`;
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

    // Safety net: clean up any build_logs entries stuck in "running" status.
    // This catches edge cases where a sub-step errored without finalizing its entry.
    this.cleanupStaleBuildLogs();
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
        getComputeServerId({ project_id: this.project_id, path: this.path }),
      );
    } catch (err) {
      this.set_error(err);
      this.setState({ knitr_error: true });
      // Mark as errored so the spinner stops, but keep partial output visible
      this.markBuildLogError("knitr");
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
        getComputeServerId({ project_id: this.project_id, path: this.path }),
      );
      // console.log(output);
    } catch (err) {
      //console.info("LaTeX Editor/actions/run_latex error=", err);
      this.set_error(err);
      // Mark the build_logs entry as errored so the build tab spinner stops,
      // but preserve any partial output for the user to diagnose the failure.
      this.markBuildLogError("latex");
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
    // Explicit PDF reload after latex compilation
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
    if (this._state === "closed") return;
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

  /**
   * Seed `switch_to_files` from the persisted local_view_state, so the
   * title-bar file dropdown survives page refreshes without requiring a
   * rebuild to repopulate. Only reads — `set_switch_to_files` is the sole
   * writer to both redux state and local_view_state.
   */
  private _hydrateSwitchToFiles(): void {
    const lvs = this.store.get("local_view_state");
    const persisted = lvs?.get("switch_to_files");
    if (persisted == null) return;
    const arr = (persisted as any).toJS ? (persisted as any).toJS() : persisted;
    if (!Array.isArray(arr) || arr.length === 0) return;
    const filtered = arr.filter(
      (p: unknown) => typeof p === "string" && p.length > 0,
    ) as string[];
    if (filtered.length === 0) return;
    this.setState({
      switch_to_files: Array.from(new Set(filtered)).sort(),
    });
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
    const next = Array.from(new Set(switch_to_files)).sort();
    this.setState({ switch_to_files: next });
    // Persist to per-file local_view_state so the dropdown survives
    // page refreshes. Canonical paths are stable relative to the
    // project root; synctex-related maps (canonical_paths /
    // relative_paths) aren't persisted and simply re-fill on the
    // next build.
    this.set_local_view_state({ switch_to_files: next });
  }

  private _update_pdf(time: number, force: boolean): void {
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
        getComputeServerId({ project_id: this.project_id, path: this.path }),
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
      // Mark as errored so the spinner stops, but keep partial output visible
      this.markBuildLogError("sagetex");
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
        getComputeServerId({ project_id: this.project_id, path: this.path }),
      );
      // Now run latex again, since we had to run pythontex, which changes the inserted snippets.
      // This +2 forces re-running latex... but still deduplicates it in case of multiple users. (+1 is for sagetex)
      await this.run_latex(time + 2, force);
    } catch (err) {
      this.set_error(err);
      // this.setState({ pythontex_error: true });
      // Mark as errored so the spinner stops, but keep partial output visible
      this.markBuildLogError("pythontex");
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
      const input = info.Input;
      const inputExt = separate_file_extension(input).ext.toLowerCase();
      if (!SYNCTEX_SOURCE_EXTS.includes(inputExt)) {
        if (!manual) {
          this.set_auto_sync_in_progress(false);
        }
        return;
      }
      await this.goto_line_in_file(line, input);
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

  // Check if forward auto-sync (CM → PDF) is enabled for any output panel
  private is_auto_sync_forward_enabled(): boolean {
    const local_view_state = this.store.get("local_view_state");
    if (!local_view_state) return false;

    // Check all output panels for forward auto-sync enabled
    for (const [key, value] of local_view_state.entrySeq()) {
      // Only check output panels
      if (this._is_output_panel(key) && value) {
        const autoSyncForward =
          typeof value.get === "function"
            ? value.get("autoSyncForward")
            : value.autoSyncForward;
        if (autoSyncForward) {
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
    if (!this.is_auto_sync_forward_enabled() || locs.length === 0) return;

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
    // console.log(
    //   "LaTeX: _get_most_recent_output_panel() via active history returning",
    //   result,
    // );

    // If no recently active output panel found, look for any output panel
    if (!result) {
      result = this._get_any_frame_id_of_type("output");
      //console.log("LaTeX: _get_any_frame_id_of_type() returning", result);
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

  // Mark a build_logs entry as "error" while preserving any partial output
  // (stdout/stderr) so the user can still see what happened before the failure.
  private markBuildLogError(stage: BuildSpecName): void {
    const build_logs: BuildLogs | undefined = this.store.get("build_logs");
    if (!build_logs) return;
    const entry = build_logs.get(stage);
    if (!entry) return;
    const js: BuildLog = entry.toJS();
    if (js.type === "async" && js.status === "running") {
      js.status = "error";
      this.set_build_logs({ [stage]: js });
    }
  }

  // Safety net: after a build completes, clean up any build_logs entries
  // that are still stuck in "running" status.  This can happen when an exec
  // stream errors out after the "job" event set status to "running" but
  // before the "done" event could finalize it.
  // Preserves partial output so the user can diagnose the failure.
  private cleanupStaleBuildLogs(): void {
    const build_logs: BuildLogs | undefined = this.store.get("build_logs");
    if (!build_logs) return;
    build_logs.forEach((entry, key) => {
      const js: BuildLog = entry?.toJS();
      if (js?.type === "async" && js?.status === "running") {
        js.status = "error";
        this.set_build_logs({ [key]: js });
      }
    });
  }

  private set_build_logs(obj: { [K in keyof IBuildSpecs]?: BuildLog }): void {
    let build_logs: BuildLogs = this.store.get("build_logs") ?? IMap();
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
    this.setState({ build_logs: IMap() });

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

  // If time is provided (non-zero), use it as the aggregate key base.
  // Note: sagetex/pythontex use time+1/time+2 to force distinct aggregate
  // keys for their re-run of latex. Only generate a fresh timestamp when
  // time=0 and force=true.
  make_timestamp(time: number, force: boolean): number {
    if (time) return time;
    return force ? server_time().valueOf() : this.last_save_time();
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

  set_frame_type(id: string, type: string): void {
    super.set_frame_type(id, type);
    if (type === "time_travel" && this.knitr) {
      // Use the source .rnw/.rtex path for time travel frames.
      this.set_frame_tree({ id, path: this.filename_knitr });
    }
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
    if (this._state === "closed" || this._syncstring == null) {
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
    // Per-frame TOC: parse from whichever .tex the user is focused on.
    // Falls back to master when the active sub-file's syncstring isn't
    // available yet; bails entirely if even the master isn't hydrated
    // (redux `store.on("change")` can fire before `ready`). `try_to_str`
    // encodes that possibility in the return type so the caller is
    // forced to handle `undefined` instead of catching a runtime throw.
    const sourcePath = this._activeCmPath();
    let sourceText: string | undefined;
    let resolvedPath = sourcePath;
    if (sourcePath !== this.path) {
      const subActions = this.redux.getEditorActions(
        this.project_id,
        path_normalize(sourcePath),
      ) as BaseActions<CodeEditorState> | undefined;
      const subSs = (subActions as any)?._syncstring as SyncString | undefined;
      sourceText = subSs?.try_to_str();
    }
    if (sourceText == null) {
      sourceText = this._syncstring?.try_to_str();
      resolvedPath = this.path;
    }
    if (sourceText == null) {
      // Neither the active sub-file nor master is ready yet — defer.
      // A subsequent syncstring "change" event will trigger us again
      // once the doc is hydrated.
      return;
    }
    const contents = fromJS(
      parseTableOfContents(sourceText, {
        includeBookmarks: true,
        includeChatMarkers: true,
      }),
    ) as any;
    this.setState({ contents, contents_path: resolvedPath });
  }

  public async scrollToHeading(entry: TableOfContentsEntry): Promise<void> {
    // The TOC is parsed from whichever .tex was focused when
    // `updateTableOfContents` last ran — so route to that same file.
    // `switch_to_file` finds the matching CM frame (or swaps the
    // current one to that path) and returns its frame id; if the user
    // switched focus since, this may reopen the file in a fresh frame.
    const targetPath = this.store.get("contents_path") ?? this.path;
    const id = await this.switch_to_file(targetPath);
    if (id == null) return;
    // `programmatically_goto_line` looks up the CM via `this._cm[id]`;
    // master's `_cm` map doesn't contain sub-file CMs, so if we just
    // called `this.programmatically_goto_line` with a sub-file's frame
    // id, master's goto would silently fall back to its own active CM
    // (wrong file, no scroll, no focus). Dispatch through the file's
    // own BaseActions when the TOC source is a sub-file. Master itself
    // stays on `this` — same instance, so no redux lookup needed.
    const targetActions =
      targetPath === this.path
        ? (this as BaseActions<CodeEditorState>)
        : (this.redux.getEditorActions(
            this.project_id,
            path_normalize(targetPath),
          ) as BaseActions<CodeEditorState> | undefined);
    if (targetActions == null) return;
    // Wait briefly for the target frame's CM to register on the
    // sub-file's actions. Without this, a click arriving before the
    // CM has mounted (e.g. first click after a fresh focus swap)
    // would fall through `_get_cm`'s `_cm[id] ?? _active_cm()`
    // fallback and scroll the wrong editor — which is exactly what
    // the "sometimes have to click twice" symptom looks like.
    const cmMap = (targetActions as any)._cm as
      | Record<string, unknown>
      | undefined;
    if (cmMap != null) {
      for (let i = 0; i < 20; i++) {
        if (cmMap[id] != null) break;
        await delay(50);
      }
    }
    await targetActions.programmatically_goto_line(
      parseInt(entry.id),
      true,
      true,
      id,
    );
  }

  languageModelExtraFileInfo() {
    return "LaTeX";
  }

  getHelpMeFixBuildContext(): string {
    const buildLogs: BuildLogs | undefined = this.store.get("build_logs");
    if (!buildLogs) return "";

    const parts: string[] = [];
    for (const stage of HELP_ME_FIX_BUILD_STAGES) {
      const entry = buildLogs.get(stage)?.toJS() as BuildLog | undefined;
      if (!entry) continue;
      const errorCount =
        ((buildLogs.getIn([stage, "parse", "errors"]) as any)?.size ?? 0) > 0;
      const stdout = tailChars(
        entry.stdout ?? "",
        MAX_HELP_ME_FIX_STDOUT_CHARS,
      );
      const stderr = tailChars(
        entry.stderr ?? "",
        MAX_HELP_ME_FIX_STDERR_CHARS,
      );
      if (!errorCount && !stdout && !stderr) continue;
      parts.push(`Build stage: ${stage}`);
      if (stdout) {
        parts.push(`Recent stdout tail:\n\`\`\`text\n${stdout}\n\`\`\``);
      }
      if (stderr) {
        parts.push(`Recent stderr tail:\n\`\`\`text\n${stderr}\n\`\`\``);
      }
    }

    return parts.join("\n\n");
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

  // ===== Chat anchors =======================================================
  //
  // A `% chat: <hash>` comment in the tex source anchors a thread in
  // the side chat. We scan the master file (and each open sub-file) for
  // markers on every syncstring change, then render a gutter icon + badge on
  // each marker line. The per-anchor thread lives in the master `.sage-chat`;
  // root messages carry `id = <hash>` and optional `path = <sub-file>`.

  /** Per-path marker scanner handles. Cleared on `close()`. */
  private _chatMarkerScanners: {
    [path: string]: {
      dispose: () => void;
      rescan: () => void;
      flush: () => void;
    };
  } = {};

  /**
   * Active inline CM TextMarkers for each scanned file. A file can be
   * shown in multiple split panes — each pane has its own CM instance and
   * its own TextMarkers (CM-owned), so we key by CM inside the path map.
   * Each TextMarker's `chatHash` field carries the hash so the click
   * handler can recover it without re-scanning.
   */
  private _chatTextMarkers: {
    [path: string]: Map<CodeMirror.Editor, CodeMirror.TextMarker[]>;
  } = {};

  /**
   * Bookmarks rendering the pill + delete widget at the end of each marker
   * line, per CM pane. Tracked separately from the TextMarkers because we
   * preserve their host DOM + React root across rescans (diffed by order
   * within the CM) to avoid flicker during rapid edits like typing a hash
   * character-by-character.
   */
  private _chatDeleteBookmarks: {
    [path: string]: Map<
      CodeMirror.Editor,
      Array<{
        bookmark: CodeMirror.TextMarker;
        host: HTMLElement;
        root: Root;
      }>
    >;
  } = {};

  /**
   * Gutter icon hosts (one per marker line, de-duped) per CM pane. We
   * drive CM's native `setGutterMarker` directly rather than going
   * through cocalc's `set_gutter_marker` (which would redux-rebuild the
   * React tree on every scan). Hosts and their React roots persist
   * across rescans; we just re-attach them to the new line. DOM hosts
   * can only live in one CM's gutter at a time, so each split pane
   * needs its own hosts.
   */
  private _chatGutterHosts: {
    [path: string]: Map<
      CodeMirror.Editor,
      Array<{
        host: HTMLElement;
        root: Root;
        line: number;
      }>
    >;
  } = {};

  /**
   * Gray bookmark icon hosts (one per `% bookmark: <text>` line) per CM
   * pane. Same persistent-React-root + native-setGutterMarker scheme as
   * the chat-marker gutter so there's no flicker on rescans.
   */
  private _chatBookmarkGutterHosts: {
    [path: string]: Map<
      CodeMirror.Editor,
      Array<{ host: HTMLElement; root: Root; line: number }>
    >;
  } = {};

  /**
   * Fast lookup of lines that currently carry a bookmark per path. Used
   * by the cursor-follow icon to suppress itself on bookmark lines (and
   * to avoid stomping the bookmark host when the cursor leaves).
   */
  private _chatBookmarkLines: { [path: string]: Set<number> } = {};

  /**
   * A pair of faint insert icons per open latex file (chat + bookmark)
   * that track the primary cursor's line. Clicks on each icon insert the
   * corresponding marker before the line. Hidden when the cursor sits on
   * a line that already has a marker or bookmark.
   *
   * The icons are antd React components mounted once into persistent
   * child DOM hosts — zero re-renders, no flicker, no dependency on
   * Font Awesome availability.
   */
  private _chatCursorInsertHosts: {
    [path: string]: Map<
      CodeMirror.Editor,
      {
        host: HTMLElement;
        chatRoot: Root;
        bookmarkRoot: Root;
        currentHandle: CodeMirror.LineHandle | null;
      }
    >;
  } = {};

  /** CM instances that already have the cursorActivity listener bound. */
  private _chatCursorInsertBound: WeakSet<CodeMirror.Editor> = new WeakSet();

  /**
   * CM instances that already have our chat mousedown handler installed.
   * Keyed by the CM editor itself so the same file shown in two split
   * panes (two distinct CM instances) each get their own handler.
   */
  private _chatClickHandlerInstalled: WeakSet<CodeMirror.Editor> =
    new WeakSet();

  /** Dispose the chat-syncdb subscription that drives lock refresh. */
  private _chatStoreDispose?: () => void;

  /**
   * Tear down every per-path chat/bookmark artifact for a single file.
   * Used both when a sub-file drops out of `switch_to_files` (so a later
   * reopen re-runs `_ensureChatUI` / `_ensureChatCursorInsert` against the
   * new CM instance instead of short-circuiting against stale caches)
   * and from `close()`, which iterates over every tracked path.
   */
  private _disposeChatStateForPath(path: string): void {
    const marks = this._chatTextMarkers[path];
    if (marks) {
      for (const list of marks.values()) {
        for (const m of list) {
          try {
            m.clear();
          } catch {
            // already cleared
          }
        }
      }
      delete this._chatTextMarkers[path];
    }
    const deleteBookmarks = this._chatDeleteBookmarks[path];
    if (deleteBookmarks) {
      for (const list of deleteBookmarks.values()) {
        for (const { bookmark, root } of list) {
          try {
            bookmark.clear();
          } catch {
            // already cleared
          }
          try {
            root.unmount();
          } catch {
            // ignored
          }
        }
      }
      delete this._chatDeleteBookmarks[path];
    }
    const gutterHosts = this._chatGutterHosts[path];
    if (gutterHosts) {
      for (const list of gutterHosts.values()) {
        for (const { root } of list) {
          try {
            root.unmount();
          } catch {
            // ignored
          }
        }
      }
      delete this._chatGutterHosts[path];
    }
    const bmGutterHosts = this._chatBookmarkGutterHosts[path];
    if (bmGutterHosts) {
      for (const list of bmGutterHosts.values()) {
        for (const { root } of list) {
          try {
            root.unmount();
          } catch {
            // ignored
          }
        }
      }
      delete this._chatBookmarkGutterHosts[path];
    }
    delete this._chatBookmarkLines[path];
    const cursorHosts = this._chatCursorInsertHosts[path];
    if (cursorHosts) {
      for (const entry of cursorHosts.values()) {
        for (const r of [entry.chatRoot, entry.bookmarkRoot]) {
          try {
            r.unmount();
          } catch {
            // ignored
          }
        }
      }
      delete this._chatCursorInsertHosts[path];
    }
    // `_chatClickHandlerInstalled` / `_chatKeybindingInstalled` are WeakSets
    // keyed by CM; those CMs are released when their panes unmount.
  }

  /** Monotonic generation so a slow openAnchorChat can detect supersede. */
  private _anchorChatOpenGeneration = 0;

  /**
   * Attach a debounced rescanner to the given BaseActions. Called once per
   * open latex file (master + sub-files). The rescan updates the master's
   * `chat_markers` store keyed by this file's path.
   */
  private _attachChatMarkerScanner(
    fileActions: BaseActions<CodeEditorState>,
    path: string,
  ): void {
    if (this._chatMarkerScanners[path] != null) return;

    const rescan = debounce(() => {
      if (this._state === "closed") return;
      const ss = (fileActions as any)._syncstring;
      if (ss == null) return;
      // Skip while the syncstring is still loading — otherwise the scan
      // sees partial/stale content and jumps would land on the wrong
      // line. The syncstring fires a "change" event once it reaches
      // "ready", so the next rescan will pick up the real content.
      if (ss.get_state?.() !== "ready") return;
      let text: string;
      try {
        text = ss.to_str();
      } catch {
        return;
      }
      const markers = scanMarkers(text);
      const cur =
        this.store.get("chat_markers") ??
        IMap<string, List<TypedMap<ChatMarker>>>();
      const prevForPath = cur.get(path);
      const next = cur.set(
        path,
        List(markers.map((m) => fromJS(m) as unknown as TypedMap<ChatMarker>)),
      );
      if (!cur.equals(next)) {
        this.setState({ chat_markers: next });
      }
      // Keep the side chat's pending anchor in sync when the user edits
      // the marker hash before sending the first message.  If the staged
      // hash disappeared and a single new hash took its place → rename;
      // if it just vanished → clear so the next send isn't orphaned.
      this._reconcilePendingAnchor(path, prevForPath, markers);
      // Always run the renderers, even when markers are unchanged: the
      // CM frame may have mounted only now (e.g. user picked this file
      // from the title-bar dropdown after the scan already completed),
      // in which case the previous render bailed on a null cm. These
      // calls diff against their persistent DOM hosts and are cheap.
      this._refreshChatMarkerGutters(path);
      this._refreshChatInlineStyles(path);
      this._refreshBookmarkGutters(path, scanBookmarks(text));
      // Re-evaluate cursor-insert visibility against the refreshed marker
      // set for every CM showing this file (split panes each have their
      // own host). `_ensureChatCursorInsert` also creates hosts for CMs
      // that just mounted since the last scan.
      this._ensureChatCursorInsert(path);
      const cursorHosts = this._chatCursorInsertHosts[path];
      if (cursorHosts) {
        for (const cm of cursorHosts.keys()) {
          this._refreshChatCursorInsert(path, cm);
        }
      }
      // If this sub-file is the one the user is currently focused on,
      // reparse so section/bookmark edits appear in the panel. Master
      // edits already drive `updateTableOfContents` via the master
      // syncstring listener hooked in `_init2`.
      //
      // We check `_activeCmPath` rather than `contents_path`: during a
      // cold open, the focused sub-file may not be hydrated when the
      // TOC first parses, so `contents_path` gets stomped to the master
      // path. Keying on the active CM instead means this scanner still
      // fires `updateTableOfContents` once the sub-file hydrates,
      // unsticking the TOC from master.
      if (path !== this.path && this._activeCmPath() === path) {
        this.updateTableOfContents();
      }
    }, 300);

    const ss = (fileActions as any)._syncstring;
    if (ss?.on) {
      ss.on("change", rescan);
    }
    // Initial scan (might be a no-op if syncstring isn't hydrated yet).
    rescan();

    // The syncstring may not be ready yet when this file was just opened
    // ad-hoc (e.g. a collaborator jumped into a sub-file). Retry the
    // listener registration every 250 ms until it sticks. Without this,
    // the "change" event never fires and marker-scan never updates.
    let registered = ss?.on != null;
    if (!registered) {
      const tryRegister = (retries: number) => {
        if (this._state === "closed") return;
        if (registered) return;
        if (this._chatMarkerScanners[path] == null) return; // disposed
        const ss2 = (fileActions as any)._syncstring;
        if (ss2?.on) {
          ss2.on("change", rescan);
          registered = true;
          rescan();
          return;
        }
        if (retries > 0) {
          setTimeout(() => tryRegister(retries - 1), 250);
        }
      };
      tryRegister(40); // up to ~10 seconds
    }

    this._chatMarkerScanners[path] = {
      dispose: () => {
        const ss2 = (fileActions as any)._syncstring;
        if (ss2?.removeListener && registered) {
          ss2.removeListener("change", rescan);
        }
        rescan.cancel();
      },
      rescan: () => {
        rescan();
      },
      flush: () => {
        rescan.flush();
      },
    };

    // Install click handler + Ctrl-Shift-M keybinding as soon as the file's
    // CM is mounted (even if there are no markers yet).
    this._ensureChatUI(path);
  }

  /**
   * Ensure every currently-open latex file has a marker scanner attached.
   * Called after `switch_to_files` changes, and once at init.
   */
  private _refreshChatMarkerScanners(): void {
    const wanted = new Set<string>();
    for (const actions of this.all_actions()) {
      const path = (actions as any).path as string;
      if (!path) continue;
      wanted.add(path);
      this._attachChatMarkerScanner(actions, path);
      // Trigger a rescan + CM-bound setup. Covers the case where a CM
      // frame mounts after the scanner was already attached — e.g. a
      // user selects the master file from the title-bar file dropdown
      // when the frame tree restored with only a sub-file visible.
      this._chatMarkerScanners[path]?.rescan();
      this._ensureChatUI(path);
    }
    // Dispose scanners for files that are no longer open, and tear down
    // all per-path UI caches so a later reopen rebuilds cleanly against
    // the freshly-mounted CM.
    for (const path of Object.keys(this._chatMarkerScanners)) {
      if (!wanted.has(path)) {
        this._chatMarkerScanners[path].dispose();
        delete this._chatMarkerScanners[path];
        this._disposeChatStateForPath(path);
        const cur = this.store.get("chat_markers");
        if (cur?.has(path)) {
          this.setState({ chat_markers: cur.delete(path) });
        }
      }
    }
  }

  /**
   * Render chat-marker gutter icons for a given path.
   *
   * Bypasses cocalc's `set_gutter_marker` (which goes through redux and a
   * `GutterMarker` React component — rebuilt on every scan, causing
   * flicker) and instead calls CM's native `cm.setGutterMarker` directly
   * with persistent DOM hosts. Hosts are paired old[i]→new[i] across
   * rescans so the React tree inside each host stays mounted.
   */
  private _refreshChatMarkerGutters(path: string): void {
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    const cms = Object.values(
      ((fileActions as any)._cm ?? {}) as {
        [id: string]: CodeMirror.Editor;
      },
    );
    if (cms.length === 0) return;

    const list = this.store.get("chat_markers")?.get(path);
    // Dedup by line — only one gutter icon per line.
    const seenLines = new Set<number>();
    const targetLines: Array<{ line: number; hash: string }> = [];
    if (list) {
      for (const m of list) {
        const marker = m.toJS() as ChatMarker;
        if (seenLines.has(marker.line)) continue;
        seenLines.add(marker.line);
        targetLines.push({ line: marker.line, hash: marker.hash });
      }
    }

    const perCm =
      this._chatGutterHosts[path] ?? (this._chatGutterHosts[path] = new Map());
    const liveCms = new Set<CodeMirror.Editor>(cms);

    // Prune entries for CMs that no longer exist (pane unmounted).
    for (const staleCm of Array.from(perCm.keys())) {
      if (!liveCms.has(staleCm)) {
        for (const e of perCm.get(staleCm) ?? []) {
          try {
            e.root.unmount();
          } catch {
            // ignored
          }
        }
        perCm.delete(staleCm);
      }
    }

    for (const cm of cms) {
      const existing = perCm.get(cm) ?? [];
      const fresh: Array<{
        host: HTMLElement;
        root: Root;
        line: number;
      }> = [];

      // Pair old[i] → new[i]. Reused hosts keep their React root alive.
      for (let i = 0; i < targetLines.length; i++) {
        const target = targetLines[i];
        const reused = existing[i];
        const host = reused?.host ?? document.createElement("span");
        if (reused == null) {
          host.className = "cc-chat-marker-gutter-host";
        }
        const root = reused?.root ?? createRoot(host);
        root.render(
          React.createElement(ChatMarkerGutter, {
            hash: target.hash,
            path,
            masterPath: this.path,
            project_id: this.project_id,
            openAnchorChat: (h, p) => {
              void this.openAnchorChat(h, p);
            },
            openAnchorChatThread: (k) => {
              void this.openAnchorChatThread(k);
            },
          }),
        );
        if (reused != null && reused.line !== target.line) {
          // Detach from the old line first.
          cm.setGutterMarker(reused.line, "CodeMirror-latex-chat", null);
        }
        cm.setGutterMarker(target.line, "CodeMirror-latex-chat", host);
        fresh.push({ host, root, line: target.line });
      }

      // Dispose any leftover old hosts beyond the new list.
      for (let i = targetLines.length; i < existing.length; i++) {
        const e = existing[i];
        cm.setGutterMarker(e.line, "CodeMirror-latex-chat", null);
        try {
          e.root.unmount();
        } catch {
          // ignored
        }
      }

      perCm.set(cm, fresh);
    }
  }

  /**
   * Render a gray bookmark icon in the chat gutter on every `% bookmark:`
   * line. Non-interactive (no click action) — the tooltip points users
   * to the Contents tab for navigation. Uses the same persistent-host +
   * native-setGutterMarker scheme as the chat-marker gutter so there's
   * no flicker on rescans.
   */
  private _refreshBookmarkGutters(
    path: string,
    bookmarks: BookmarkMarker[],
  ): void {
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    const cms = Object.values(
      ((fileActions as any)._cm ?? {}) as {
        [id: string]: CodeMirror.Editor;
      },
    );
    if (cms.length === 0) return;

    const seen = new Set<number>();
    const targetLines: number[] = [];
    for (const b of bookmarks) {
      if (seen.has(b.line)) continue;
      seen.add(b.line);
      targetLines.push(b.line);
    }
    this._chatBookmarkLines[path] = seen;

    const perCm =
      this._chatBookmarkGutterHosts[path] ??
      (this._chatBookmarkGutterHosts[path] = new Map());
    const liveCms = new Set<CodeMirror.Editor>(cms);

    for (const staleCm of Array.from(perCm.keys())) {
      if (!liveCms.has(staleCm)) {
        for (const e of perCm.get(staleCm) ?? []) {
          try {
            e.root.unmount();
          } catch {
            // ignored
          }
        }
        perCm.delete(staleCm);
      }
    }

    for (const cm of cms) {
      const existing = perCm.get(cm) ?? [];
      const fresh: Array<{ host: HTMLElement; root: Root; line: number }> = [];

      for (let i = 0; i < targetLines.length; i++) {
        const targetLine = targetLines[i];
        const reused = existing[i];
        const host = reused?.host ?? document.createElement("span");
        if (reused == null) {
          host.className = "cc-chat-bookmark-gutter-host";
          host.title =
            "Bookmark \u2014 open the Contents tab in the Output frame to navigate bookmarks";
          // Swallow clicks so CM doesn't reposition the cursor.
          host.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
          host.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
        }
        const root = reused?.root ?? createRoot(host);
        root.render(React.createElement(Icon, { name: "bookmark" }));
        if (reused != null && reused.line !== targetLine) {
          cm.setGutterMarker(reused.line, "CodeMirror-latex-chat", null);
        }
        cm.setGutterMarker(targetLine, "CodeMirror-latex-chat", host);
        fresh.push({ host, root, line: targetLine });
      }

      for (let i = targetLines.length; i < existing.length; i++) {
        const e = existing[i];
        cm.setGutterMarker(e.line, "CodeMirror-latex-chat", null);
        try {
          e.root.unmount();
        } catch {
          // ignored
        }
      }

      perCm.set(cm, fresh);
    }
  }

  /**
   * Lazily create the cursor-follow insert-icon host for a file. Installs
   * CM's cursorActivity listener once, then delegates to
   * `_refreshChatCursorInsert` for every subsequent cursor move.
   */
  private _ensureChatCursorInsert(path: string): void {
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    const cms = Object.values(
      ((fileActions as any)._cm ?? {}) as {
        [id: string]: CodeMirror.Editor;
      },
    );
    if (cms.length === 0) return;

    const perCm =
      this._chatCursorInsertHosts[path] ??
      (this._chatCursorInsertHosts[path] = new Map());
    const liveCms = new Set<CodeMirror.Editor>(cms);

    // Prune entries for CMs that have unmounted.
    for (const staleCm of Array.from(perCm.keys())) {
      if (liveCms.has(staleCm)) continue;
      const stale = perCm.get(staleCm);
      if (stale) {
        for (const r of [stale.chatRoot, stale.bookmarkRoot]) {
          try {
            r.unmount();
          } catch {
            // ignored
          }
        }
      }
      perCm.delete(staleCm);
    }

    for (const cm of cms) {
      if (perCm.has(cm)) continue;

      const host = document.createElement("span");
      host.className = "cc-chat-cursor-insert";
      // Swallow the outer mousedown so CM doesn't reposition the cursor
      // when the user aims at one of our icons.
      host.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      const makeIconHost = (
        title: string,
        onClick: (line: number) => void,
      ): { child: HTMLElement; root: Root } => {
        const child = document.createElement("span");
        child.title = title;
        child.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const entry = this._chatCursorInsertHosts[path]?.get(cm);
          if (entry?.currentHandle == null) return;
          const line = cm.getLineNumber(entry.currentHandle);
          if (line == null) return;
          onClick(line);
        });
        const root = createRoot(child);
        host.appendChild(child);
        return { child, root };
      };

      const { root: chatRoot } = makeIconHost(
        "Insert chat anchor before this line",
        (line) => {
          void this._insertChatMarkerBeforeLine(path, line, cm);
        },
      );
      chatRoot.render(React.createElement(Icon, { name: "comment" }));

      const { root: bookmarkRoot } = makeIconHost(
        "Insert bookmark before this line",
        (line) => {
          void this.insertBookmark({ targetPath: path, targetLine: line, cm });
        },
      );
      bookmarkRoot.render(React.createElement(Icon, { name: "bookmark" }));

      perCm.set(cm, {
        host,
        chatRoot,
        bookmarkRoot,
        currentHandle: null,
      });

      if (!this._chatCursorInsertBound.has(cm)) {
        this._chatCursorInsertBound.add(cm);
        cm.on("cursorActivity", () => this._refreshChatCursorInsert(path, cm));
      }
      this._refreshChatCursorInsert(path, cm);
    }
  }

  /**
   * Place the single cursor-follow host on the primary cursor's starting
   * line — unless that line already has a marker, in which case the host
   * is detached from the gutter.
   */
  private _refreshChatCursorInsert(path: string, cm: CodeMirror.Editor): void {
    const entry = this._chatCursorInsertHosts[path]?.get(cm);
    if (entry == null) return;

    const selections = cm.listSelections();
    const primary = selections[0];
    if (primary == null) return;
    const startLine = Math.min(primary.anchor.line, primary.head.line);

    const markerList = this.store.get("chat_markers")?.get(path);
    let hasAnyMarker = false;
    if (markerList) {
      for (const m of markerList) {
        if ((m.toJS() as ChatMarker).line === startLine) {
          hasAnyMarker = true;
          break;
        }
      }
    }
    if (!hasAnyMarker) {
      const bmLines = this._chatBookmarkLines[path];
      if (bmLines?.has(startLine)) hasAnyMarker = true;
    }

    const newHandle = hasAnyMarker ? null : cm.getLineHandle(startLine);
    if (newHandle === entry.currentHandle) return;

    if (entry.currentHandle != null) {
      // Only clear if the old line doesn't now have a marker or bookmark —
      // otherwise the marker/bookmark refresh code has already placed its
      // own host there and clearing would stomp it.
      const oldLine = cm.getLineNumber(entry.currentHandle);
      let oldLineHasHost = false;
      if (oldLine != null && markerList) {
        for (const m of markerList) {
          if ((m.toJS() as ChatMarker).line === oldLine) {
            oldLineHasHost = true;
            break;
          }
        }
      }
      if (!oldLineHasHost && oldLine != null) {
        const bmLines = this._chatBookmarkLines[path];
        if (bmLines?.has(oldLine)) oldLineHasHost = true;
      }
      if (!oldLineHasHost) {
        try {
          cm.setGutterMarker(
            entry.currentHandle,
            "CodeMirror-latex-chat",
            null,
          );
        } catch {
          // stale handle; ignore
        }
      }
    }
    if (newHandle != null) {
      cm.setGutterMarker(newHandle, "CodeMirror-latex-chat", entry.host);
    }
    entry.currentHandle = newHandle;
  }

  /**
   * Insert `% chat: <hash>\n\n` at the start of `line`, push the existing
   * content down, and open the side chat. Cursor positions after the
   * insertion point follow automatically (CM shifts them). Unlike the
   * generic `insertChatMarker`, this never introduces a line break at
   * the cursor's column.
   */
  private async _insertChatMarkerBeforeLine(
    path: string,
    line: number,
    cm?: CodeMirror.Editor,
  ): Promise<void> {
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    // Use the caller's CM (e.g. the split pane whose cursor-insert fired)
    // so edits land in the pane the user is looking at, falling back to
    // the recently-focused frame's CM before `_get_cm()`'s first match.
    const targetCm = cm ?? this._cmForInsert(fileActions);
    if (targetCm == null) return;

    const hash = generateMarkerHash();
    targetCm.replaceRange(
      buildMarkerLine(hash) + "\n\n",
      { line, ch: 0 },
      { line, ch: 0 },
    );
    fileActions.set_syncstring_to_codemirror();
    (fileActions as any)._syncstring?.commit?.();

    // Flush the debounced marker scan so `getAnchorLabel(hash)` resolves
    // to the real surrounding-section text rather than the raw hash —
    // otherwise the hash becomes the permanent thread name.
    this._chatMarkerScanners[path]?.flush?.();

    const chatActions = await this._waitForChatActions();
    if (chatActions == null) return;
    chatActions.setPendingAnchorThread({
      id: hash,
      label: this.getAnchorLabel(hash),
      path,
    });
    this._showChatFrameInChatMode();
  }

  /**
   * Re-create CodeMirror `TextMarker`s on each marker so the raw
   * `% chat: <hash>` text is rendered like a URL link. Also ensures the CM's
   * mousedown handler is installed, so clicking the styled text opens the
   * corresponding side-chat thread.
   */
  private _refreshChatInlineStyles(path: string): void {
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    const cms = Object.values(
      ((fileActions as any)._cm ?? {}) as {
        [id: string]: CodeMirror.Editor;
      },
    );
    if (cms.length === 0) return;

    const tmMap =
      this._chatTextMarkers[path] ?? (this._chatTextMarkers[path] = new Map());
    const bmMap =
      this._chatDeleteBookmarks[path] ??
      (this._chatDeleteBookmarks[path] = new Map());
    const liveCms = new Set<CodeMirror.Editor>(cms);

    // Prune entries for CMs that no longer exist (pane unmounted). The
    // TextMarkers and bookmarks are CM-owned — they're already gone, but
    // we still need to unmount the React roots for the tail widgets.
    for (const staleCm of Array.from(tmMap.keys())) {
      if (liveCms.has(staleCm)) continue;
      tmMap.delete(staleCm);
    }
    for (const staleCm of Array.from(bmMap.keys())) {
      if (liveCms.has(staleCm)) continue;
      for (const e of bmMap.get(staleCm) ?? []) {
        try {
          e.root.unmount();
        } catch {
          // ignored
        }
      }
      bmMap.delete(staleCm);
    }

    const list = this.store.get("chat_markers")?.get(path);

    for (const cm of cms) {
      // Clear stale TextMarkers (cheap — CSS-only spans, no React).
      const staleTms = tmMap.get(cm) ?? [];
      for (const m of staleTms) {
        try {
          m.clear();
        } catch {
          // already cleared
        }
      }
      // For delete/pill bookmarks we REUSE old entries by order — pairing
      // old[i] with new[i] — so the bookmark's host DOM + React root stay
      // alive across rescans. This is what prevents the pill/× flicker when
      // the user is typing a marker's hash or pressing Enter above a marker.
      const oldBookmarks = bmMap.get(cm) ?? [];
      let oldIdx = 0;
      const fresh: CodeMirror.TextMarker[] = [];
      const freshBookmarks: Array<{
        bookmark: CodeMirror.TextMarker;
        host: HTMLElement;
        root: Root;
      }> = [];

      if (list) {
        for (const entry of list) {
          const marker = entry.toJS() as ChatMarker;
          const lineText = cm.getLine(marker.line) ?? "";
          // Lock the marker range once a real thread exists for this hash,
          // so the user can't accidentally break the ties by editing the id.
          // They can still delete the whole range (CM allows selection+delete
          // around a read-only span).
          const locked = this._anchorHasMessages(marker.hash);
          const tm = cm.markText(
            { line: marker.line, ch: marker.col },
            { line: marker.line, ch: lineText.length },
            {
              className: locked
                ? "cc-chat-marker cc-chat-marker-locked"
                : "cc-chat-marker",
              // Let our click handler see mousedown; don't let CM swallow it.
              handleMouseEvents: false,
              clearOnEnter: false,
              inclusiveLeft: false,
              inclusiveRight: false,
              readOnly: locked,
              atomic: locked,
              attributes: {
                title: locked
                  ? `Open chat thread (locked — remove the marker to edit)`
                  : `Open chat thread`,
              },
            },
          );
          // Stash the hash on the TextMarker so click handler can recover it.
          // `chatLocked` lets the narrow lock-only refresh detect state flips.
          (tm as any).chatHash = marker.hash;
          (tm as any).chatPath = path;
          (tm as any).chatLocked = locked;
          fresh.push(tm);

          // Inline tail widget: reuse an existing host+root from the old
          // bookmark list when available (same CM, same ordinal). This
          // keeps the pill/× DOM attached to CM without unmount/remount.
          const reused = oldBookmarks[oldIdx];
          oldIdx += 1;
          const host = reused?.host ?? document.createElement("span");
          if (reused == null) {
            host.className = "cc-chat-marker-tail-host";
          }
          const root = reused?.root ?? createRoot(host);
          const lineForBookmark = marker.line;
          const colForBookmark = marker.col;
          const hashForBookmark = marker.hash;
          root.render(
            React.createElement(ChatMarkerInlineTail, {
              hash: hashForBookmark,
              masterPath: this.path,
              project_id: this.project_id,
              onOpen: () => {
                void this.openAnchorChat(hashForBookmark, path);
              },
              // Default × action: resolve the chat AND remove every marker
              // we know about for this hash. Callback closes over the hash
              // (not line/col) because resolveChatMarker walks all scanned
              // files and deletes bottom-up, which is safer than deleting
              // by stale (line, col) coords from this render snapshot.
              onConfirmResolve: () => {
                void this.resolveChatMarker(hashForBookmark);
              },
              // Stale form: just remove this single marker line/col; the
              // thread is already resolved.
              onConfirmRemoveStale: () =>
                this.deleteChatMarker(path, lineForBookmark, colForBookmark),
            }),
          );
          if (reused?.bookmark) {
            try {
              reused.bookmark.clear();
            } catch {
              // already cleared
            }
          }
          // Defensive: if the host element is still attached anywhere
          // (stale CM wrapper from a clear() that didn't fully detach, a
          // concurrent rescan that re-attached, etc.), pull it out before
          // CM places it again. Without this, we can end up with the host
          // visible in two CM positions ("ghost" delete `×` next to the
          // real one) until the next full editor mount.
          if (host.parentNode != null) {
            host.parentNode.removeChild(host);
          }
          const bookmark = cm.setBookmark(
            { line: marker.line, ch: lineText.length },
            { widget: host, insertLeft: false, handleMouseEvents: true },
          );
          freshBookmarks.push({ bookmark, host, root });
        }
      }
      // Any old bookmarks not consumed by a new marker get fully disposed.
      for (let i = oldIdx; i < oldBookmarks.length; i++) {
        try {
          oldBookmarks[i].bookmark.clear();
        } catch {
          // already cleared
        }
        try {
          oldBookmarks[i].root.unmount();
        } catch {
          // ignored
        }
      }
      tmMap.set(cm, fresh);
      bmMap.set(cm, freshBookmarks);

      // Belt-and-braces sweep: if any `cc-chat-marker-tail-host` element
      // remains in THIS CM's wrapper that is NOT one of the hosts we just
      // placed, it's a stranded duplicate from an earlier render — detach
      // it. Scoped per CM so we don't disturb the other pane's hosts.
      const wrapper = cm.getWrapperElement?.();
      if (wrapper) {
        const live = new Set<HTMLElement>(freshBookmarks.map((b) => b.host));
        const stragglers = wrapper.querySelectorAll<HTMLElement>(
          ".cc-chat-marker-tail-host",
        );
        stragglers.forEach((el) => {
          if (!live.has(el)) {
            el.parentNode?.removeChild(el);
          }
        });
      }

      this._ensureChatClickHandler(cm, path);
    }
  }

  /**
   * Install a single CM `mousedown` handler per file that opens the side
   * chat when the user clicks inside a marker range, and a Ctrl-Shift-M
   * keybinding for "Insert chat marker".
   */
  private _ensureChatClickHandler(cm: CodeMirror.Editor, path: string): void {
    this._ensureChatKeybindings(cm, path);
    if (this._chatClickHandlerInstalled.has(cm)) return;
    this._chatClickHandlerInstalled.add(cm);

    cm.on("mousedown", (_cm, event) => {
      // Plain left-click only; leave right-click / modifier clicks for
      // regular editor behavior (text selection, context menu).
      if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const pos = cm.coordsChar(
        { left: event.clientX, top: event.clientY },
        "window",
      );
      if (pos == null) return;
      const marks = cm.findMarksAt(pos);
      for (const m of marks) {
        const hash = (m as any).chatHash as string | undefined;
        if (typeof hash === "string") {
          event.preventDefault();
          // Stale marker: hash matches the former anchor of a resolved
          // thread, no active thread exists. Clicking through would
          // stage a fresh pending anchor on a retired hash and break
          // the resolved-archive invariant. The inline tail's stale ×
          // is the supported path to remove the leftover marker — this
          // click just no-ops.
          if (this._isStaleChatHash(hash)) return;
          void this.openAnchorChat(hash, path);
          return;
        }
      }
    });
  }

  /**
   * True iff `hash` is a "stale" chat anchor: at least one root message
   * has been resolved with this hash as its former anchor, AND no
   * active anchored thread for this hash exists. Used by the CM text
   * click handler to refuse opening chat on retired hashes.
   */
  private _isStaleChatHash(hash: string): boolean {
    const chatActions = getSideChatActions({
      project_id: this.project_id,
      path: this.path,
    });
    const messages = chatActions?.store?.get("messages");
    if (messages == null) return false;
    let hasResolved = false;
    for (const [, msg] of messages) {
      if (msg == null || msg.get("reply_to")) continue;
      const active = msg.get("id") ?? msg.get("cell_id");
      if (active === hash && msg.get("resolved") == null) {
        // Active thread exists for this hash — not stale.
        return false;
      }
      if (formerAnchorIdOf(msg) === hash) hasResolved = true;
    }
    return hasResolved;
  }

  /** CM instances that already have the Shift-Ctrl-M keymap bound. */
  private _chatKeybindingInstalled: WeakSet<CodeMirror.Editor> = new WeakSet();

  private _ensureChatKeybindings(cm: CodeMirror.Editor, path: string): void {
    if (this._chatKeybindingInstalled.has(cm)) return;
    this._chatKeybindingInstalled.add(cm);
    cm.addKeyMap({
      "Shift-Ctrl-M": () => {
        void this.insertChatMarker({ targetPath: path, cm });
      },
      "Shift-Cmd-M": () => {
        void this.insertChatMarker({ targetPath: path, cm });
      },
      "Shift-Ctrl-B": () => {
        void this.insertBookmark({ targetPath: path, cm });
      },
      "Shift-Cmd-B": () => {
        void this.insertBookmark({ targetPath: path, cm });
      },
    });
  }

  /**
   * Eagerly install the click handler + keybinding on a file's CM, even if
   * the file currently has no markers. Retries briefly while CM is still
   * mounting. Safe to call multiple times (the installers dedupe on path).
   */
  private _ensureChatUI(path: string, retries: number = 6): void {
    if (this._state === "closed") return;
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) {
      return;
    }
    // Every split pane showing this file has its own CM instance; install
    // the click handler + keybinding on each. WeakSet de-duping handles
    // repeat calls.
    const cms = Object.values(
      ((fileActions as any)._cm ?? {}) as {
        [id: string]: CodeMirror.Editor;
      },
    );
    if (cms.length === 0) {
      if (retries > 0) {
        setTimeout(() => this._ensureChatUI(path, retries - 1), 250);
      }
      return;
    }
    for (const cm of cms) {
      this._ensureChatClickHandler(cm, path);
    }
    this._ensureChatCursorInsert(path);
    // If a scan already completed while the CM was still mounting, the
    // refresh calls silently no-op'd. Run them again now that CM is ready
    // so the inline styling + gutter icon + tail widget show up.
    this._refreshChatMarkerGutters(path);
    this._refreshChatInlineStyles(path);
    // Replay bookmark gutter icons too. The scanner runs `scanBookmarks`
    // and calls `_refreshBookmarkGutters`, but a scan that completed
    // before this CM mounted never rendered anything. Re-derive the
    // bookmark set from the current syncstring and re-render.
    const ss = (fileActions as any)._syncstring;
    if (ss?.get_state?.() === "ready") {
      let text: string | undefined;
      try {
        text = ss.to_str?.();
      } catch {
        text = undefined;
      }
      if (typeof text === "string") {
        this._refreshBookmarkGutters(path, scanBookmarks(text));
      }
    }
  }

  /**
   * If the side chat has a pending anchor staged for `path`, keep it
   * aligned with what the scanner currently sees in that file:
   *   - hash still present → leave alone
   *   - hash gone, exactly one new hash appeared → rename (follow it)
   *   - hash gone, nothing new → clear (avoid orphaning a thread)
   */
  private _reconcilePendingAnchor(
    path: string,
    prev: List<TypedMap<ChatMarker>> | undefined,
    next: ChatMarker[],
  ): void {
    const chatActions = getSideChatActions({
      project_id: this.project_id,
      path: this.path,
    });
    const pending = chatActions?.getPendingAnchorThread?.();
    if (pending == null || pending.path !== path) return;
    const nextHashes = next.map((m) => m.hash);
    if (nextHashes.includes(pending.id)) return;
    const prevHashes = new Set<string>(
      prev?.map((m) => m.get("hash") as string).toArray() ?? [],
    );
    const newlyAdded = nextHashes.filter((h) => !prevHashes.has(h));
    if (newlyAdded.length === 1) {
      const hash = newlyAdded[0];
      chatActions?.setPendingAnchorThread({
        id: hash,
        label: this.getAnchorLabel(hash),
        path,
      });
    } else {
      chatActions?.setPendingAnchorThread(null);
    }
  }

  /** Flatten all markers from all scanned files. */
  private _allChatMarkers(): Array<{ path: string; marker: ChatMarker }> {
    const out: Array<{ path: string; marker: ChatMarker }> = [];
    const byPath = this.store.get("chat_markers");
    if (!byPath) return out;
    for (const [path, list] of byPath.entries()) {
      if (list == null) continue;
      for (const m of list) {
        out.push({ path, marker: m.toJS() as ChatMarker });
      }
    }
    return out;
  }

  /**
   * True iff the side-chat syncdb already contains a root message whose
   * `id` equals the given hash. This is the signal that a thread has been
   * created for this anchor and the inline marker should be locked.
   */
  private _anchorHasMessages(hash: string): boolean {
    const chatActions = getSideChatActions({
      project_id: this.project_id,
      path: this.path,
    });
    const messages = chatActions?.store?.get("messages");
    if (messages == null) return false;
    for (const [, msg] of messages) {
      const anchorId = msg?.get("id") ?? msg?.get("cell_id");
      if (anchorId === hash && !msg.get("reply_to")) {
        return true;
      }
    }
    return false;
  }

  /**
   * Subscribe to chat-syncdb changes so the inline `% chat: <hash>` markers
   * flip from editable to read-only the moment the first message is sent
   * (or, conversely, unlock if the thread's root is deleted).
   *
   * We purposely do NOT rebuild the bookmark widgets here — the pill/×
   * React components are already reactive via `useAnchoredThreads` and
   * update their own counts. Only the TextMarker's locked styling needs a
   * CM-level recreation, and only when the lock state actually flipped —
   * otherwise the widgets flicker on every chat message.
   */
  private async _initChatAnchorLockListener(): Promise<void> {
    const chatActions = await this._waitForChatActions();
    if (chatActions == null || this._state === "closed") return;
    const store = chatActions.store;
    if (store == null) return;
    const onChange = debounce(() => {
      if (this._state === "closed") return;
      for (const p of Object.keys(this._chatTextMarkers)) {
        this._refreshChatMarkerLocks(p);
      }
    }, 150);
    store.on("change", onChange);
    this._chatStoreDispose = () => {
      store.removeListener?.("change", onChange);
      onChange.cancel();
    };
  }

  /**
   * Narrow refresh: only re-create TextMarkers whose `locked` state has
   * changed since the last scan. Leaves the bookmark widgets (and their
   * React roots) alone, so the pill/× don't blink on chat activity.
   */
  private _refreshChatMarkerLocks(path: string): void {
    const tmMap = this._chatTextMarkers[path];
    if (tmMap == null) return;
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    const cms = Object.values(
      ((fileActions as any)._cm ?? {}) as {
        [id: string]: CodeMirror.Editor;
      },
    );
    if (cms.length === 0) return;

    for (const cm of cms) {
      const existing = tmMap.get(cm) ?? [];
      const fresh: CodeMirror.TextMarker[] = [];
      let changed = false;

      for (const tm of existing) {
        const range = tm.find?.();
        const hash = (tm as any).chatHash as string | undefined;
        if (!range || !hash || !("from" in range)) {
          try {
            tm.clear();
          } catch {
            // already cleared
          }
          changed = true;
          continue;
        }
        const wasLocked = (tm as any).chatLocked === true;
        const nowLocked = this._anchorHasMessages(hash);
        if (wasLocked === nowLocked) {
          fresh.push(tm);
          continue;
        }
        // Lock flipped — re-create just this TextMarker (CM5 can't toggle
        // atomic / readOnly on an existing mark).
        const fromLine = range.from.line;
        const fromCh = range.from.ch;
        try {
          tm.clear();
        } catch {
          // already cleared
        }
        const lineText = cm.getLine(fromLine) ?? "";
        const newTm = cm.markText(
          { line: fromLine, ch: fromCh },
          { line: fromLine, ch: lineText.length },
          {
            className: nowLocked
              ? "cc-chat-marker cc-chat-marker-locked"
              : "cc-chat-marker",
            handleMouseEvents: false,
            clearOnEnter: false,
            inclusiveLeft: false,
            inclusiveRight: false,
            readOnly: nowLocked,
            atomic: nowLocked,
            attributes: {
              title: nowLocked
                ? `Open chat thread (locked — remove the marker to edit)`
                : `Open chat thread`,
            },
          },
        );
        (newTm as any).chatHash = hash;
        (newTm as any).chatPath = path;
        (newTm as any).chatLocked = nowLocked;
        fresh.push(newTm);
        changed = true;
      }
      if (changed) {
        tmMap.set(cm, fresh);
      }
    }
  }

  private async _waitForChatActions(): Promise<ReturnType<
    typeof getSideChatActions
  > | null> {
    for (const d of [1, 10, 50, 200, 500, 1000, 2000, 4000]) {
      await delay(d);
      if (this._state === "closed") return null;
      const chatActions = getSideChatActions({
        project_id: this.project_id,
        path: this.path,
      });
      if (chatActions?.syncdb) return chatActions;
    }
    return null;
  }

  private _showChatFrameInChatMode(): void {
    const frameId = this.show_focused_frame_of_type("chat", "col", false, 0.7);
    if (frameId) {
      this.set_frame_tree({ id: frameId, chat_mode: "chat" });
    }
  }

  // ----- Generic anchor-adapter methods (called by shared chat UI) --------

  public getAnchorLocations(
    hash: string,
  ): Array<{ path: string; line: number; label?: string }> {
    // 1. Live scan results — one entry per marker occurrence, with a real
    //    line number. Only populated for files currently open in the
    //    editor (master + open sub-files).
    const out: Array<{ path: string; line: number; label?: string }> = [];
    for (const { path, marker } of this._allChatMarkers()) {
      if (marker.hash === hash) {
        out.push({ path, line: marker.line });
      }
    }
    if (out.length > 0) return out;

    // 2. Fallback for collaborators who haven't opened the sub-file yet:
    //    the ChatMessage root carries the `path` it was created in, so we
    //    can at least offer to open that file. `line: -1` signals "no line
    //    info available" so the label and jump code omit the line number.
    const chatActions = getSideChatActions({
      project_id: this.project_id,
      path: this.path,
    });
    const messages = chatActions?.store?.get("messages");
    if (messages != null) {
      for (const [, msg] of messages) {
        const anchorId = msg?.get("id") ?? msg?.get("cell_id");
        if (anchorId === hash && !msg.get("reply_to")) {
          const storedPath = msg.get("path") as string | undefined;
          if (storedPath) {
            return [{ path: storedPath, line: -1 }];
          }
        }
      }
    }
    return [];
  }

  public getAnchorLabel(hash: string): string {
    const locs = this.getAnchorLocations(hash);
    if (locs.length === 0) return hash;
    if (locs.length > 1) return `${hash} (${locs.length} locations)`;
    const [loc] = locs;
    const basename = loc.path.split("/").pop() ?? loc.path;
    if (loc.line < 0) return `${hash} (${basename})`;
    return `${hash} (${basename}:${loc.line + 1})`;
  }

  /**
   * Short, human-readable "where does this anchor live" label suitable
   * for jump-to-source button text. Returns just `basename:line` (or
   * `basename` if the line is unknown), without the opaque hash —
   * complementary to `getAnchorLabel`, which prefixes the hash for
   * places that need an unambiguous thread identifier (e.g. the auto
   * thread name written to the chat root).
   *
   * Returns `undefined` when no location is known, so the caller can
   * decide whether to show a generic "Jump to anchor" fallback or hide
   * the button entirely.
   */
  public getAnchorJumpLabel(hash: string): string | undefined {
    const locs = this.getAnchorLocations(hash);
    if (locs.length === 0) return undefined;
    if (locs.length > 1) return `${locs.length} locations`;
    const [loc] = locs;
    const basename = loc.path.split("/").pop() ?? loc.path;
    return loc.line < 0 ? basename : `${basename}:${loc.line + 1}`;
  }

  public async jumpToAnchor(hash: string): Promise<void> {
    const locs = this.getAnchorLocations(hash);
    if (locs.length === 0) return;
    const target = locs[0];

    // Always switch_to_file to make sure SOME frame is showing the target
    // path — even for the master file. Without this, if the user is
    // currently viewing a sub-file, clicking a master-file anchor would
    // fire goto_line on the recently-focused CM (the sub-file's), which
    // would scroll the wrong file.
    const frameId = await this.switch_to_file(target.path);

    // Pick the actions instance that owns the CM for the target path. The
    // master file's CM is registered on `this`; a sub-file's CM is on its
    // own CodeEditorActions. Calling goto_line on the wrong one would
    // poll fruitlessly.
    let targetActions: BaseActions<CodeEditorState>;
    if (target.path === this.path) {
      targetActions = this as BaseActions<CodeEditorState>;
    } else {
      const a = this.redux.getEditorActions(
        this.project_id,
        path_normalize(target.path),
      ) as BaseActions<CodeEditorState> | undefined;
      if (a == null) return;
      targetActions = a;
      // Sub-file may have been opened ad-hoc (e.g. collaborator jumping
      // into a file that isn't in switch_to_files yet) — attach scanner.
      this._attachChatMarkerScanner(targetActions, target.path);
      this._ensureChatUI(target.path);
    }

    // Wait for the target's syncstring to be fully loaded. Otherwise the
    // scan runs on partial content and returns an outdated line number.
    const targetSs = (targetActions as any)._syncstring;
    if (targetSs != null && targetSs.get_state?.() === "init") {
      try {
        await once(targetSs, "ready");
      } catch {
        // give up — the syncstring errored; we'll jump with whatever
        // line info we have
      }
      if (this._state === "closed") return;
    }

    // Re-read after ready: live scan may now have the current line.
    let line = target.line;
    {
      const refreshed = this.getAnchorLocations(hash).find(
        (l) => l.path === target.path && l.line >= 0,
      );
      if (refreshed) line = refreshed.line;
    }
    if (line < 0) {
      // The scanner hasn't produced a result yet even though ss is ready
      // (debounce is 300ms). Poll briefly.
      for (const d of [50, 100, 200, 500, 1000, 2000]) {
        await delay(d);
        if (this._state === "closed") return;
        const live = this.getAnchorLocations(hash).find(
          (l) => l.path === target.path && l.line >= 0,
        );
        if (live) {
          line = live.line;
          break;
        }
      }
    }
    if (line < 0) return;

    await targetActions.programmatically_goto_line(
      line + 1,
      true,
      true,
      frameId,
    );
  }

  public async openAnchorChat(hash: string, path?: string): Promise<void> {
    const gen = ++this._anchorChatOpenGeneration;
    this._showChatFrameInChatMode();
    const label = this.getAnchorLabel(hash);
    const chatActions = await this._waitForChatActions();
    if (chatActions == null) return;
    if (gen !== this._anchorChatOpenGeneration) return;

    if (chatActions.store?.get("messages") != null) {
      // Re-check stale-anchor state with hydrated messages: a click
      // landed before chat sync was ready would have passed the
      // gutter/text/TOC stale gates (they returned false on
      // un-hydrated stores), but we must not stage a fresh pending
      // thread on a hash whose only history is a resolve.
      if (this._isStaleChatHash(hash)) return;
      chatActions.findOrCreateAnchorThread(hash, label, path);
      return;
    }
    // Slow path: poll until messages hydrate.
    for (const d of [50, 100, 200, 500, 1000, 2000, 4000]) {
      await delay(d);
      if (this._state === "closed") return;
      if (gen !== this._anchorChatOpenGeneration) return;
      if (chatActions.store?.get("messages") != null) {
        if (this._isStaleChatHash(hash)) return;
        chatActions.findOrCreateAnchorThread(hash, label, path);
        return;
      }
    }
  }

  public async openAnchorChatThread(threadKey: string): Promise<void> {
    this._showChatFrameInChatMode();
    const chatActions = await this._waitForChatActions();
    chatActions?.setSelectedThread(threadKey);
  }

  /**
   * Remove a chat marker from the source at the given path+line+col. For
   * block-form markers (the entire line is only the marker) the whole line
   * including its trailing newline is removed. For inline-form (the marker
   * follows other tex content) only the range from the `%` back through
   * preceding whitespace up to end-of-line is removed, keeping the tex.
   *
   * The associated thread in `.sage-chat` is left intact (orphaned). If the
   * user wants to re-anchor, they insert a fresh marker.
   */
  public deleteChatMarker(targetPath: string, line: number, col: number): void {
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(targetPath),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    const cm = (fileActions as any)._get_cm?.() as
      | CodeMirror.Editor
      | undefined;
    if (cm == null) return;
    const lineText = cm.getLine(line);
    if (lineText == null) return;

    // Clear any inline TextMarker covering this range first so CM's readOnly
    // span doesn't block the delete. Walk every CM pane that has markers —
    // TextMarkers are CM-owned, so split panes each carry their own set.
    const stale = this._chatTextMarkers[targetPath];
    if (stale) {
      for (const list of stale.values()) {
        for (const tm of list) {
          const range = tm.find?.();
          if (
            range &&
            "from" in range &&
            range.from.line === line &&
            range.from.ch === col
          ) {
            try {
              tm.clear();
            } catch {
              // already cleared
            }
          }
        }
      }
    }

    const beforePct = lineText.slice(0, col);
    const isBlockForm = beforePct.trim().length === 0;
    if (isBlockForm) {
      // Delete the whole line + its trailing newline (or the whole doc-end
      // line without newline if it's the last line).
      const lastLine = cm.lastLine();
      if (line < lastLine) {
        cm.replaceRange("", { line, ch: 0 }, { line: line + 1, ch: 0 });
      } else {
        // last line: remove leading newline of the line being removed
        cm.replaceRange(
          "",
          {
            line: Math.max(0, line - 1),
            ch: cm.getLine(line - 1)?.length ?? 0,
          },
          { line, ch: lineText.length },
        );
      }
    } else {
      // Inline form: trim trailing whitespace before `%` too.
      let startCh = col;
      while (startCh > 0 && /\s/.test(lineText[startCh - 1])) {
        startCh -= 1;
      }
      cm.replaceRange("", { line, ch: startCh }, { line, ch: lineText.length });
    }
    fileActions.set_syncstring_to_codemirror();
    (fileActions as any)._syncstring?.commit?.();
  }

  /**
   * Resolve a chat thread anchored at `hash`: stamp `resolved` metadata on
   * each anchored root message in the side-chat syncdb, clear its active
   * `id`/`path`, and then remove every `% chat: <hash>` marker we know
   * about across currently-scanned files.
   *
   * Markers in sub-files that aren't open at the time of resolve persist as
   * "stale" markers — see `useResolvedAnchoredThreads` and the gutter/tail
   * stale rendering. A subsequent open of that file will surface them with
   * a quick "remove stale marker" affordance.
   */
  public async resolveChatMarker(hash: string): Promise<void> {
    if (typeof hash !== "string" || hash.length === 0) return;
    const chatActions = await this._waitForChatActions();
    if (chatActions == null) return;

    // 1. Resolve every active anchored root message for this hash. Snapshot
    // the dates first so we don't iterate over a store that's mutating.
    const messages = chatActions.store?.get("messages");
    const rootDates: Date[] = [];
    if (messages != null) {
      for (const [, msg] of messages) {
        if (msg == null) continue;
        if (msg.get("reply_to")) continue;
        if (msg.get("resolved") != null) continue;
        const anchor = msg.get("id") ?? msg.get("cell_id");
        if (anchor !== hash) continue;
        const date = msg.get("date");
        if (date instanceof Date) rootDates.push(date);
      }
    }
    for (const d of rootDates) {
      chatActions.resolveAnchorThread(d);
    }

    // 2. Collect every marker line for this hash across scanned paths.
    // Group by path and sort descending so deletions don't shift later
    // lines we still plan to touch within the same file.
    const all = this.store.get("chat_markers");
    if (all != null) {
      const byPath: { [path: string]: { line: number; col: number }[] } = {};
      for (const [path, list] of all.entries()) {
        if (list == null) continue;
        for (const entry of list) {
          const m = entry.toJS() as ChatMarker;
          if (m.hash === hash) {
            (byPath[path] ??= []).push({ line: m.line, col: m.col });
          }
        }
      }
      for (const [path, lines] of Object.entries(byPath)) {
        lines.sort((a, b) =>
          b.line !== a.line ? b.line - a.line : b.col - a.col,
        );
        for (const { line, col } of lines) {
          this.deleteChatMarker(path, line, col);
        }
        // Force the scanner to immediately reflect the post-delete state so
        // any UI driven off `chat_markers` is consistent before we return.
        this._chatMarkerScanners[path]?.flush?.();
      }
    }
  }

  /**
   * Discard a pending (just-inserted but no-message-yet) chat marker.
   * Called from the side chat's "Cancel" button on the empty pending
   * compose, so canceling out also removes the source marker the user
   * wanted to abandon.
   *
   * Safety: only removes markers for `pending.id` if no chat message
   * (active OR resolved) has ever referenced that hash. The callsite
   * already guards on `pendingAnchorThread != null` (which by definition
   * means no root message exists yet), but a concurrent message-send
   * could land between user click and our store read; this guard means
   * we never delete markers for a real conversation.
   *
   * Always clears the pending anchor regardless — clearing is what the
   * caller actually requested.
   */
  public cancelPendingAnchorThread(pending: {
    id: string;
    path?: string;
    label?: string;
  }): void {
    const hash = pending?.id;
    const chatActions = getSideChatActions({
      project_id: this.project_id,
      path: this.path,
    });
    chatActions?.setPendingAnchorThread(null);
    if (typeof hash !== "string" || hash.length === 0) return;
    // Bail if any chat message ever referenced this hash — this should
    // never be true for a true pending anchor, but it's the cheap
    // safety net Codex flagged.
    const messages = chatActions?.store?.get("messages");
    if (messages != null) {
      for (const [, msg] of messages) {
        if (msg == null) continue;
        const active = msg.get("id") ?? msg.get("cell_id");
        if (active === hash) return;
        const resolvedRaw = msg.get("resolved");
        if (resolvedRaw != null) {
          const formerId =
            typeof (resolvedRaw as any).get === "function"
              ? (resolvedRaw as any).get("anchorId")
              : (resolvedRaw as any).anchorId;
          if (formerId === hash) return;
        }
      }
    }
    // Delete every marker with this hash in scanned files. Bottom-up
    // per file so line numbers don't shift mid-batch — same dance as
    // resolveChatMarker's marker step.
    const all = this.store.get("chat_markers");
    if (all == null) return;
    const byPath: { [path: string]: { line: number; col: number }[] } = {};
    for (const [path, list] of all.entries()) {
      if (list == null) continue;
      for (const entry of list) {
        const m = entry.toJS() as ChatMarker;
        if (m.hash === hash) {
          (byPath[path] ??= []).push({ line: m.line, col: m.col });
        }
      }
    }
    for (const [path, lines] of Object.entries(byPath)) {
      lines.sort((a, b) =>
        b.line !== a.line ? b.line - a.line : b.col - a.col,
      );
      for (const { line, col } of lines) {
        this.deleteChatMarker(path, line, col);
      }
      this._chatMarkerScanners[path]?.flush?.();
    }
  }

  /**
   * For the "Start new chat thread" affordance on a resolved chat panel:
   * report where a new marker would land if we called `insertChatMarker()`
   * right now (active CM's path + cursor line). Used to populate the
   * confirmation popup so the user isn't surprised. Returns `null` when no
   * CM is currently focused.
   */
  public previewMarkerInsertion(): {
    path: string;
    line: number;
  } | null {
    const path = this._activeCmPath();
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(path),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return null;
    const cm = this._cmForInsert(fileActions);
    if (cm == null) return null;
    const line = cm.getCursor().line;
    return { path, line };
  }

  // ----- Marker insertion --------------------------------------------------

  /**
   * Insert a new chat marker. If `targetPath` is omitted, use the active CM
   * frame's path (defaulting to the master file). If `mode === "auto"`, pick
   * inline if the target line has tex content, block otherwise.
   */
  public async insertChatMarker(
    opts: {
      targetPath?: string;
      targetLine?: number;
      mode?: "inline" | "block" | "auto";
      cm?: CodeMirror.Editor;
    } = {},
  ): Promise<void> {
    const targetPath = opts.targetPath ?? this._activeCmPath();
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(targetPath),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    // Prefer the CM that fired the trigger (e.g. a split-pane keymap)
    // so inserts land in the pane the user is actually looking at.
    // When absent (Insert-menu click has no CM reference), resolve via
    // the recently-focused frame so we pick the pane the user last
    // interacted with instead of the first _cm entry for the file.
    const cm = opts.cm ?? this._cmForInsert(fileActions);
    if (cm == null) return;

    const cursor = cm.getCursor();
    const targetLine = opts.targetLine ?? cursor.line;
    const lineText = cm.getLine(targetLine) ?? "";
    const mode: "inline" | "block" =
      opts.mode === "inline" || opts.mode === "block"
        ? opts.mode
        : lineHasTexContent(lineText)
          ? "inline"
          : "block";

    const hash = generateMarkerHash();

    if (mode === "inline") {
      // Append `  % chat: <hash>` to end of the target line.
      const insertion = buildInlineInsertion(hash);
      cm.replaceRange(
        insertion,
        { line: targetLine, ch: lineText.length },
        { line: targetLine, ch: lineText.length },
      );
    } else {
      // Block: insert a paragraph-broken marker above the target line.
      const insertion = buildBlockInsertion(hash);
      cm.replaceRange(
        insertion,
        { line: targetLine, ch: 0 },
        { line: targetLine, ch: 0 },
      );
    }

    // Sync CM edit into syncstring so the scan picks it up.
    fileActions.set_syncstring_to_codemirror();
    (fileActions as any)._syncstring?.commit?.();

    // Restore cursor roughly to its original place (the block insertion has
    // shifted subsequent lines down by 2).
    if (mode === "block") {
      cm.setCursor({ line: cursor.line + 2, ch: cursor.ch });
    }

    // The marker scanner is debounced (300ms), so `getAnchorLabel(hash)`
    // would otherwise fall through to `hash` and get saved as the thread
    // name. Flush the pending scan now so the label resolves to the real
    // surrounding-section text before we stage the pending anchor.
    this._chatMarkerScanners[targetPath]?.flush?.();

    // Stage pending anchor and open the side chat.
    const chatActions = await this._waitForChatActions();
    if (chatActions == null) return;
    chatActions.setPendingAnchorThread({
      id: hash,
      label: this.getAnchorLabel(hash),
      path: targetPath,
    });
    this._showChatFrameInChatMode();
  }

  /**
   * Look up the path the user is currently editing. Prefer the path of the
   * most recently focused CM frame (which may be a sub-file); fall back to
   * the master path.
   */
  private _activeCmPath(): string {
    const frameId = this.show_recently_focused_frame_of_type?.("cm");
    if (frameId != null) {
      const node = this._get_frame_node(frameId);
      const p = node?.get("path");
      if (typeof p === "string" && p.length > 0) return p;
    }
    return this.path;
  }

  /**
   * Look up the CM for `targetPath` to use for an insert-style action
   * when the caller didn't pass one explicitly. Prefers the CM in the
   * recently-focused frame so Insert-menu clicks and other non-pane
   * callers land in the split the user is actually looking at, falling
   * back to the BaseActions' default `_get_cm()` (first CM for the
   * file) only if no focused frame targets this path.
   */
  private _cmForInsert(
    fileActions: BaseActions<CodeEditorState>,
  ): CodeMirror.Editor | undefined {
    const frameId = this.show_recently_focused_frame_of_type?.("cm");
    if (frameId != null) {
      const focused = (fileActions as any)._cm?.[frameId] as
        | CodeMirror.Editor
        | undefined;
      if (focused != null) return focused;
    }
    return (fileActions as any)._get_cm?.() as CodeMirror.Editor | undefined;
  }

  /**
   * Insert a collaborative bookmark above the cursor's line in the
   * currently-active CM. The default text is a short random hash, inserted
   * as `% bookmark: <text>` with the text portion selected so the user can
   * immediately type a meaningful label.
   *
   * Unlike chat markers, bookmarks are free-form text and never become
   * read-only.
   */
  public async insertBookmark(
    opts: {
      targetPath?: string;
      targetLine?: number;
      cm?: CodeMirror.Editor;
    } = {},
  ): Promise<void> {
    const targetPath = opts.targetPath ?? this._activeCmPath();
    const fileActions = this.redux.getEditorActions(
      this.project_id,
      path_normalize(targetPath),
    ) as BaseActions<CodeEditorState> | undefined;
    if (fileActions == null) return;
    // Prefer the CM that fired the trigger (e.g. a split-pane keymap)
    // so inserts land in the pane the user is actually looking at.
    // When absent (Insert-menu click has no CM reference), resolve via
    // the recently-focused frame so we pick the pane the user last
    // interacted with instead of the first _cm entry for the file.
    const cm = opts.cm ?? this._cmForInsert(fileActions);
    if (cm == null) return;

    const cursor = cm.getCursor();
    const targetLine = opts.targetLine ?? cursor.line;
    const defaultText = generateBookmarkText(server_time());
    const markerLine = buildBookmarkLine(defaultText);
    // Insert the bookmark line + trailing newline above the current line,
    // pushing existing content down by 2 (marker line + one blank spacer).
    cm.replaceRange(
      markerLine + "\n\n",
      { line: targetLine, ch: 0 },
      { line: targetLine, ch: 0 },
    );
    fileActions.set_syncstring_to_codemirror();
    (fileActions as any)._syncstring?.commit?.();

    // Select the default text so the user can type-over to rename it.
    const textStart = markerLine.length - defaultText.length;
    cm.setSelection(
      { line: targetLine, ch: textStart },
      { line: targetLine, ch: markerLine.length },
    );
    cm.focus();
  }
}
