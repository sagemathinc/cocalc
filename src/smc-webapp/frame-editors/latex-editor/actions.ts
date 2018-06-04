/*
LaTeX Editor Actions.
*/

const WIKI_HELP_URL = "https://github.com/sagemathinc/cocalc/wiki/LaTeX-Editor";
const VIEWERS = ["pdfjs_canvas", "pdfjs_svg", "pdf_embed", "build"];

import { fromJS, List, Map } from "immutable";
import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";
import { latexmk, build_command } from "./latexmk";
import { sagetex, sagetex_hash } from "./sagetex";
import * as synctex from "./synctex";
import { bibtex } from "./bibtex";
import { server_time, ExecOutput } from "../generic/client";
import { clean } from "./clean";
import { LatexParser, ProcessedLatexLog } from "./latex-log-parser";
import { update_gutters } from "./gutters";
import { pdf_path } from "./util";
import { forgetDocument, url_to_pdf } from "./pdfjs-doc-cache";
import { FrameTree } from "../frame-tree/types";
import { Store } from "../../smc-react-ts";
import { createTypedMap, TypedMap } from "../../smc-react/TypedMap";
import { print_html } from "../frame-tree/print";
import { raw_url } from "../frame-tree/util";
import { path_split } from "../generic/misc";

interface BuildLog extends ExecOutput {
  parse?: ProcessedLatexLog;
}

export type BuildLogs = Map<string, Map<string, any>>;

interface ScrollIntoViewParams {
  page: number;
  y: number;
  id: string;
}

const ScrollIntoViewRecord = createTypedMap<ScrollIntoViewParams>();

interface LatexEditorState extends CodeEditorState {
  build_logs: BuildLogs;
  sync: string;
  scroll_pdf_into_view: TypedMap<ScrollIntoViewParams>;
  zoom_page_width: string;
  zoom_page_height: string;
  build_command: string | List<string>;
}

export class Actions extends BaseActions<LatexEditorState> {
  public project_id: string;
  public store: Store<LatexEditorState>;
  private _last_save_time: number = 0;
  private _last_sagetex_hash: string;
  private is_building: boolean = false;

  _init2(): void {
    if (!this.is_public) {
      this._init_syncstring_value();
      this._init_latexmk();
      this._init_spellcheck();
      this._init_config();
      this._init_first_build();
    }
  }

  _init_first_build(): void {
    const f = () => {
      if (this.store.get("is_loaded")) {
        this.build();
      }
    };
    this._syncstring.once("init", f);
    this._syncdb.once("init", f);
  }

  _init_latexmk(): void {
    const account : any = this.redux.getStore("account");

    this._syncstring.on("save-to-disk", time => {
      this._last_save_time = time;
      if (account && account.getIn(["editor_settings", "build_on_save"])) {
        this.build();
      }
    });
  }

  _init_config(): void {
    this.setState({ build_command: "" }); // empty means not yet initialized
    this._init_syncdb(["key"]);
    this._syncdb.on("init", () => {
      const x = this._syncdb.get_one({
        key: "build_command"
      });
      if (x !== undefined) {
        this.setState({ build_command: fromJS(x.get("value")) });
      } else {
        // default
        this.set_build_command(
          build_command("PDFLaTeX", path_split(this.path).tail)
        );
      }
    });
    this._syncdb.on("change", () => {
      const x = this._syncdb.get_one({ key: "build_command" });
      if (x !== undefined && x.get("value") !== undefined) {
        this.setState({ build_command: fromJS(x.get("value")) });
      }
    });
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
        "WARNING: Your LaTeX file is badly misformatted; it is not possible to generate a useful PDF file.\n" +
        s.trim();
      console.warn(err);
      this.set_error(err);
    }
  }

  // used by generic framework.
  async build(id?: string): Promise<void> {
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
      await this.save(false);
      await this.run_build(this._last_save_time);
    } finally {
      this.is_building = false;
    }
  }

  clean(): void {
    this.build_action("clean");
  }

  async run_build(time: number): Promise<void> {
    this.setState({ build_logs: Map() });
    await this.run_latex(time);
    const s = this.store.unsafe_getIn(["build_logs", "latex", "stdout"]);
    if (typeof s == "string" && s.indexOf("sagetex.sty") != -1) {
      await this.run_sagetex(time);
    }
  }

  async run_latex(time: number): Promise<void> {
    let output: BuildLog;
    let build_command: string | string[];
    let s: string | List<string> = this.store.get("build_command");
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
        time || this._last_save_time,
        status
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

    // forget currently cached pdf
    this._forget_pdf_document();
    // ... before setting a new one for all the viewers,
    // which causes them to reload.
    for (let x of VIEWERS) {
      this.set_reload(x, time);
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

  async run_bibtex(time: number): Promise<void> {
    this.set_status("Running BibTeX...");
    try {
      const output: BuildLog = await bibtex(
        this.project_id,
        this.path,
        time || this._last_save_time
      );
      this.set_build_logs({ bibtex: output });
    } catch (err) {
      this.set_error(err);
    }
    this.set_status("");
  }

  async run_sagetex(time: number): Promise<void> {
    const status = s => this.set_status(`Running SageTeX... ${s}`);
    status("");
    // First compute hash of sagetex file.
    let hash: string;
    try {
      hash = await sagetex_hash(this.project_id, this.path, time, status);
      if (hash === this._last_sagetex_hash) {
        // no change - nothing to do.
        return;
      }
    } catch (err) {
      this.set_error(err);
      return;
    } finally {
      this.set_status("");
    }

    try {
      // Next run Sage.
      const output: BuildLog = await sagetex(
        this.project_id,
        this.path,
        hash,
        status
      );
      this.set_build_logs({ sagetex: output });
      // Now run latex again, since we had to run sagetex, which changes
      // the sage output. This +1 forces re-running latex... but still dedups
      // it in case of multiple users.
      await this.run_latex(time + 1);
    } catch (err) {
      this.set_error(err);
    } finally {
      this._last_sagetex_hash = hash;
      this.set_status("");
    }
  }

  async synctex_pdf_to_tex(page: number, x: number, y: number): Promise<void> {
    this.set_status("Running SyncTex...");
    try {
      let info = await synctex.pdf_to_tex({
        x,
        y,
        page,
        pdf_path: pdf_path(this.path),
        project_id: this.project_id
      });
      this.set_status("");
      let line = info.Line;
      if (typeof line != "number") {
        // TODO: would be nicer to handle this at the source...
        throw Error("invalid synctex output (Line must be a number).");
      }
      // TODO #v1: info.Input="/home/user/projects/98e85b9b-51bb-4889-be47-f42698c37ed4/./a.tex", so
      // go to the right file!
      this.programmatical_goto_line(line, true, true);
    } catch (err) {
      console.warn("ERROR ", err);
      this.set_error(err);
    }
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
    try {
      info = await synctex.tex_to_pdf({
        line,
        column,
        tex_path: filename,
        pdf_path: pdf_path(this.path),
        project_id: this.project_id
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

  set_build_logs(obj: {
    latex?: BuildLog;
    bibtex?: BuildLog;
    sagetex?: BuildLog;
  }): void {
    let build_logs: BuildLogs = this.store.get("build_logs");
    let k: string;
    for (k in obj) {
      const v: BuildLog = obj[k];
      build_logs = build_logs.set(k, fromJS(v));
    }
    this.setState({ build_logs });
  }

  async run_clean(): Promise<void> {
    let log: string = "";
    delete this._last_save_time;
    this.setState({ build_logs: Map() });

    const logger = (s: string): void => {
      log += s + "\n";
      let build_logs: BuildLogs = this.store.get("build_logs");
      this.setState({
        build_logs: build_logs.set("clean", fromJS({ stdout: log }))
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
      case "build":
        this.run_build(now);
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
    let cm = this._cm[id];
    if (cm) {
      // Clicked the sync button from within an editor
      this.forward_search(id);
    } else {
      // Clicked button associated to a a preview pane -- let the preview pane do the work.
      this.setState({ sync: id });
    }
  }

  forward_search(id: string): void {
    let cm = this._get_cm(id);
    if (!cm) return;
    let { line, ch } = cm.getDoc().getCursor();
    this.synctex_tex_to_pdf(line, ch, this.path);
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
    if (!node) {
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
    const now = server_time().valueOf();
    this._syncdb.set({ key: "build_command", value: command, time: now });
    this._syncdb.save();
    this.setState({ build_command: fromJS(command) });
  }
}
