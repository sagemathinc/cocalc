/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
TimeTravel Frame Editor Actions

path/to/file.foo --> path/to/.file.foo.time-travel

Right now the file path/to/.file.foo.time-travel is empty, but we plan to use it later.

IMPORTANT:
(1) Jupyter classic still uses the old history viewer, and
(2) If you open an old .sage-history file from a project log, that also still opens
the old viewer, which is a convenient fallback if somebody needs it for some reason.

*/
import { debounce } from "lodash";
import { List } from "immutable";
import { once } from "@cocalc/util/async-utils";
import { filename_extension, path_split } from "@cocalc/util/misc";
import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { webapp_client } from "../../webapp-client";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { ViewDocument } from "./view-document";
import {
  Actions as CodeEditorActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { export_to_json } from "./export-to-json";
import type { Document } from "@cocalc/sync/editor/generic/types";
import LRUCache from "lru-cache";
import { syncdbPath } from "@cocalc/util/jupyter/names";

const EXTENSION = ".time-travel";

// const log = (...args) => console.log("time-travel", ...args);

// We use a global cache so if user closes and opens file
// later it is fast.
const gitShowCache = new LRUCache<string, string>({
  maxSize: 10 * 10 ** 6, // 10MB
  sizeCalculation: (value, _key) => {
    return value.length + 1; // must be positive
  },
});

/*interface FrameState {
  // date.valueOf() in non-range mode
  version: number;
  // date of left handle in range mode
  version0: number;
  // date of right handle in range mode
  version1: number;
  changes_mode: boolean;
  git_mode: boolean;
}*/

export interface TimeTravelState extends CodeEditorState {
  versions: List<number>;
  git_versions: List<number>;
  loading: boolean;
  has_full_history: boolean;
  docpath: string;
  docext: string;
  // true if in a git repo
  git?: boolean;
  //frame_states: Map<string, any>; // todo: really map from frame_id to FrameState as immutable map.
  // timetravel has own error state
  error: string;
  // first index of versions. This changes when you load more.
  start_index: number;
}

export class TimeTravelActions extends CodeEditorActions<TimeTravelState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  private docpath: string;
  private docext: string;
  private syncpath: string;
  syncdoc?: SyncDoc;
  private first_load: boolean = true;
  ambient_actions?: CodeEditorActions;
  private gitLog: {
    [t: number]: { hash: string; name: string; subject: string };
  } = {};

  _init2(): void {
    const { head, tail } = path_split(this.path);
    this.docpath = tail.slice(1, tail.length - EXTENSION.length);
    if (head != "") {
      this.docpath = head + "/" + this.docpath;
    }
    // log("init", { path: this.path });
    this.syncpath = this.docpath;
    this.docext = filename_extension(this.docpath);
    if (this.docext == "ipynb") {
      this.syncpath = syncdbPath(this.docpath);
    }
    this.setState({
      versions: List([]),
      loading: true,
      has_full_history: false,
      docpath: this.docpath,
      docext: this.docext,
    });
    this.init_syncdoc();
    this.updateGitVersions();
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "time_travel" };
  }

  init_frame_tree = () => {};

  close = (): void => {
    if (this.syncdoc != null) {
      this.syncdoc.close();
      delete this.syncdoc;
    }
    super.close();
  };

  set_error = (error) => {
    this.setState({ error });
  };

  private init_syncdoc = async (): Promise<void> => {
    const persistent = this.docext == "ipynb" || this.docext == "sagews"; // ugly for now (?)
    this.syncdoc = await webapp_client.sync_client.open_existing_sync_document({
      project_id: this.project_id,
      path: this.syncpath,
      persistent,
    });
    if (this.syncdoc == null) return;
    this.syncdoc.on("change", debounce(this.syncdoc_changed, 1000));
    if (this.syncdoc.get_state() != "ready") {
      await once(this.syncdoc, "ready");
    }
    // cause initial load -- we could be plugging into an already loaded syncdoc,
    // so there wouldn't be any change event, so we have to trigger this.
    this.syncdoc_changed();
    this.syncdoc.on("close", () => {
      // in our code we don't check if the state is closed, but instead
      // that this.syncdoc is not null.
      delete this.syncdoc;
    });
    this.setState({
      loading: false,
      has_full_history: this.syncdoc.has_full_history(),
    });
  };

  loadMoreHistory = async (): Promise<void> => {
    // log("loadMoreHistory");
    if (
      this.store.get("has_full_history") ||
      this.syncdoc == null ||
      this.store.get("git_mode")
    ) {
      return;
    }
    await this.syncdoc.loadMoreHistory();
    this.setState({ has_full_history: this.syncdoc.has_full_history() });
    this.syncdoc_changed(); // load new versions list.
  };

  private syncdoc_changed = (): void => {
    //  log("syncdoc_changed");
    if (this.syncdoc == null) return;
    if (this.syncdoc?.get_state() != "ready") {
      return;
    }
    let versions;
    try {
      // syncdoc_changed -- can get called at any time, so have to be extra careful
      versions = List<number>(
        this.syncdoc.all_versions().map((x) => x.valueOf()),
      );
    } catch (err) {
      this.setState({ versions: List([]) });
      return;
    }
    const start_index = this.syncdoc.historyStartIndex();
    this.setState({ versions, start_index });
    if (this.first_load) {
      this.first_load = false;
    }
  };

  // Get the given version of the document.
  get_doc = (version: number): Document | undefined => {
    // log("get_doc", version);
    if (this.syncdoc == null) {
      return;
    }
    const state = this.syncdoc.get_state();
    if (state != "ready") {
      return;
    }
    return this.syncdoc.version(new Date(version));
  };

  get_account_ids = (version0: number, version1: number): string[] => {
    //    log("get_account_ids", version0, version1);
    if (this.syncdoc == null) {
      return [];
    }
    const account_ids = new Set<string>();
    for (const version of Array.from(new Set([version0, version1]))) {
      if (version == null) {
        continue;
      }
      const date = new Date(version);
      try {
        const account_id = this.syncdoc.account_id(date);
        if (account_id) {
          account_ids.add(account_id);
        }
      } catch (err) {
        // fails if version is not actually known.
        continue;
      }
    }
    return Array.from(account_ids);
  };

  private getFrameNodeGlobal = (id: string) => {
    // log("getFrameNodeGlobal", id);
    for (const actions of [this, this.ambient_actions]) {
      if (actions == null) continue;
      const node = actions._get_frame_node(id);
      if (node != null) return node;
    }
    throw Error(`BUG -- no node with id ${id}`);
  };

  open_file = async (): Promise<void> => {
    // log("open_file");
    const actions = this.redux.getProjectActions(this.project_id);
    await actions.open_file({ path: this.docpath, foreground: true });
  };

  // Revert the live version of the document to a specific version */
  revert = async (
    id: string,
    version: number,
    doc: Document,
  ): Promise<void> => {
    const { syncdoc } = this;
    if (syncdoc == null) {
      return;
    }
    const node = this.getFrameNodeGlobal(id);
    syncdoc.commit();
    if (node.get("git_mode")) {
      syncdoc.from_str(doc.to_str());
    } else {
      syncdoc.revert(new Date(version));
    }
    await syncdoc.commit(true);

    // Some editors, e.g., the code text editor, only update Codemirror when
    // "after-change" is emitted (not just "change"), and commit does NOT result
    // in an after-change on this client (because usually you don't want that).
    // So we do it manually here.  Without this, revert when editing code would
    // not work.
    syncdoc.emit("after-change");

    await this.open_file();
  };

  open_snapshots = (): void => {
    // log("open_snapshots");
    this.redux.getProjectActions(this.project_id).open_directory(".snapshots");
  };

  exportEditHistory = async (): Promise<string> => {
    // log("exportEditHistory");
    const path = await export_to_json(
      this.syncdoc,
      this.docpath,
      this.project_id,
    );
    const actions = this.redux.getProjectActions(this.project_id);
    await actions.open_file({ path, foreground: true });
    return path;
  };

  // We have not implemented any way to do programmatical_goto_line this for time travel yet.
  // It will be very interesting and useful, because it will allow for
  // linking to a specific line/cell at a **specific point in time**.
  // async programmatical_goto_line() {}

  private gitCommand = async (args: string[], commit?: string) => {
    // log("gitCommand", { args, commit });
    const { head, tail } = path_split(this.docpath);
    return await exec({
      command: "git",
      args: args.concat([`${commit ? commit + ":./" : ""}${tail}`]),
      path: head,
      project_id: this.project_id,
      err_on_exit: true,
    });
  };

  updateGitVersions = async () => {
    // log("updateGitVersions");
    // versions is an ordered list of Date objects, one for each commit that involves this file.
    try {
      const { stdout } = await this.gitCommand([
        "log",
        `--format="%at %H %an <%ae> %s"`,
        "--",
      ]);
      this.gitLog = {};
      const versions: Date[] = [];
      for (const x of stdout.split("\n")) {
        const y = x.slice(1, -1);
        const i = y.indexOf(" ");
        if (i == -1) continue;
        const t0 = y.slice(0, i);
        const j = y.indexOf(" ", i + 1);
        if (j == -1) continue;
        const hash = y.slice(i + 1, j).trim();
        const k = y.indexOf("> ", j + 1);
        const name = y.slice(j + 1, k + 1).trim();
        const subject = y.slice(k + 1).trim();
        if (!x || !t0 || !hash) {
          continue;
        }
        const t = parseInt(t0) * 1000;
        this.gitLog[t] = { hash, name, subject };
        versions.push(new Date(t));
      }
      versions.reverse();
      const git_versions = List<number>(versions.map((x) => x.valueOf()));
      this.setState({
        git: versions.length > 0,
        git_versions,
      });
      return git_versions;
    } catch (_err) {
      // Do NOT report error -- instead, disable git mode.  This should
      // happen if the file is not in a git repo.
      this.setState({ git: false });
      return;
    }
  };

  private gitShow = async (version: number): Promise<string | undefined> => {
    // log("gitShow", { version });
    const h = this.gitLog[version]?.hash;
    if (h == null) {
      return;
    }
    const key = `${h}:${this.docpath}`;
    if (gitShowCache.has(key)) {
      return gitShowCache.get(key);
    }
    try {
      const { stdout } = await this.gitCommand(["show"], h);
      gitShowCache.set(key, stdout);
      return stdout;
    } catch (err) {
      this.set_error(`${err}`);
      return;
    }
  };

  gitNames = (v0: number | undefined, v1: number | undefined): string[] => {
    // log("gitNames", { version0, version1 });
    if (v0 == null || v1 == null) {
      return [];
    }
    if (v0 == v1) {
      const d = this.gitLog[`${v0}`];
      if (d) {
        return [d.name];
      } else {
        return [];
      }
    }
    const names: string[] = [];
    for (const t in this.gitLog) {
      const t0 = parseInt(t);
      if (v0 < t0 && t0 <= v1) {
        names.push(this.gitLog[t].name);
      }
    }
    return names;
  };

  gitSubject = (version: number): string | undefined => {
    return this.gitLog[version]?.subject;
  };

  gitDoc = async (version: number): Promise<ViewDocument | undefined> => {
    // log("gitDoc", { version });
    const str = await this.gitShow(version);
    if (str == null) {
      return undefined;
    }
    return new ViewDocument(this.docpath, str);
  };
}

export { TimeTravelActions as Actions };
