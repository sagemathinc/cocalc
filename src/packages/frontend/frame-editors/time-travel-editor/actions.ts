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
import { filename_extension, keys, path_split } from "@cocalc/util/misc";
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

// We use a global cache so if user closes and opens file
// later it is fast.
const gitShowCache = new LRUCache<string, string>({
  maxSize: 10 * 10 ** 6, // 10MB
  sizeCalculation: (value, _key) => {
    return value.length + 1; // must be positive
  },
});

/*interface FrameState {
  version: number;
  version0: number;
  version1: number;
  changes_mode: boolean;
  git_mode: boolean;
}*/

export interface TimeTravelState extends CodeEditorState {
  versions: List<Date>;
  git_versions: List<Date>;
  loading: boolean;
  has_full_history: boolean;
  docpath: string;
  docext: string;
  // true if in a git repo
  git?: boolean;
  //frame_states: Map<string, any>; // todo: really map from frame_id to FrameState as immutable map.
  // timetravel has own error state
  error: string;
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

  close(): void {
    if (this.syncdoc != null) {
      this.syncdoc.close();
      delete this.syncdoc;
    }
    super.close();
  }

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

  init_frame_tree = () => {
    this.ensureSelectedVersionsAreConsistent();
  };

  ensureSelectedVersionsAreConsistent = ({
    versions,
    git_versions,
  }: {
    versions?;
    git_versions?;
  } = {}): void => {
    if (versions == null) {
      if (this.syncdoc == null || this.syncdoc.get_state() != "ready") return;
      versions =
        this.store.get("versions") ?? List<Date>(this.syncdoc.all_versions());
    }
    if (git_versions == null) {
      git_versions = this.store.get("git_versions");
    }
    // make sure all the version and version ranges are valid...
    const max = versions.size - 1;
    const max_git = git_versions != null ? git_versions.size - 1 : Infinity;
    for (const actions of [this.ambient_actions, this]) {
      if (actions == null) continue;
      for (const id in actions._get_leaf_ids()) {
        const node = actions._get_frame_node(id);
        if (node?.get("type") != "time_travel") {
          continue;
        }
        const m = node.get("git_mode") ? max_git : max;
        for (const x of ["version", "version0", "version1"]) {
          let n: number | undefined = node.get(x);
          if (n == null || n > m || n < 0) {
            // make it m except in the case of "version0"
            // when we want it to be one less than version1, which
            // will be m.
            // Also for git mode when m=Infinity, use 0 since there is no other option.
            if (m == Infinity) {
              n = 0;
            } else {
              n = x == "version0" ? Math.max(0, m - 1) : m;
            }
            actions.set_frame_tree({ id, [x]: n });
          }
        }
      }
    }
  };

  loadFullHistory = async (): Promise<void> => {
    if (
      this.store.get("has_full_history") ||
      this.syncdoc == null ||
      this.store.get("git_mode")
    ) {
      return;
    }
    await this.syncdoc.load_full_history();
    this.setState({ has_full_history: true });
    this.syncdoc_changed(); // load new versions list.
  };

  private syncdoc_changed = (): void => {
    if (this.syncdoc == null) return;
    if (this.syncdoc?.get_state() != "ready") {
      return;
    }
    let versions;
    try {
      // syncdoc_changed -- can get called at any time, so have to be extra careful
      versions = List<Date>(this.syncdoc.all_versions());
    } catch (err) {
      this.setState({ versions: List([]) });
      return;
    }
    this.ensure_versions_are_stable(versions);
    this.setState({ versions });
    if (this.first_load) {
      this.first_load = false;
      this.ensureSelectedVersionsAreConsistent({ versions });
    }
  };

  // For each store version in a frame node, check to see
  // if the Date changes from the current versions to the new
  // ones and if so, fix it. We do this because if you're looking
  // at time t at position p, and somebody inserts a new version
  // before position p ... then suddenly position p is no longer
  // time t, which would be confusing.
  private ensure_versions_are_stable = (new_versions): void => {
    // TODO
    new_versions = new_versions;
  };

  // Get the given version of the document.
  get_doc = (version: Date): Document | undefined => {
    if (this.syncdoc == null) return;
    const state = this.syncdoc.get_state();
    if (state != "ready") return;
    return this.syncdoc.version(version);
  };

  get_account_ids = (version0: number, version1: number): string[] => {
    if (this.syncdoc == null) return [];
    const versions = this.store.get("versions");
    if (versions == null || versions.size == 0) return [];
    const account_ids: { [account_id: string]: boolean } = {};
    for (let version = version0; version <= version1; version++) {
      const date = versions.get(version);
      if (date == null) continue;
      try {
        account_ids[this.syncdoc.account_id(date)] = true;
      } catch (err) {
        // fails if version is not actually known.
        continue;
      }
    }
    return keys(account_ids);
  };

  private getFrameNodeGlobal = (id: string) => {
    for (const actions of [this, this.ambient_actions]) {
      if (actions == null) continue;
      const node = actions._get_frame_node(id);
      if (node != null) return node;
    }
    throw Error(`BUG -- no node with id ${id}`);
  };

  set_version = (id: string, version: number): void => {
    for (const actions of [this, this.ambient_actions]) {
      if (actions == null || actions._get_frame_node(id) == null) continue;
      if (typeof version != "number") {
        // be extra careful
        throw Error("version must be a number");
      }
      const node = actions._get_frame_node(id);
      if (node == null) {
        return;
      }
      const versions = node.get("git_mode")
        ? this.store.get("git_versions")
        : this.store.get("versions");
      if (versions == null || versions.size == 0) return;
      if (version == -1 || version >= versions.size) {
        version = versions.size - 1;
      } else if (version < 0) {
        version = 0;
      }
      actions.set_frame_tree({ id, version });
      return;
    }
  };

  setNewestVersion = (id: string) => {
    const node = this.getFrameNodeGlobal(id);
    const versions = node?.get("git_mode")
      ? this.store.get("git_versions")
      : this.store.get("versions");
    const v = (versions?.size ?? 0) - 1;
    if (v >= 0) {
      this.set_version(id, v);
    }
  };

  step = (id: string, delta: number): void => {
    const node = this.getFrameNodeGlobal(id);
    if (node.get("changes_mode")) {
      this.setVersions(
        id,
        node.get("version0") + delta,
        node.get("version1") + delta,
      );
      return;
    }
    const versions = node.get("git_mode")
      ? this.store.get("git_versions")
      : this.store.get("versions");
    if (versions == null || versions.size == 0) return;
    let version = node.get("version");
    if (version == null) {
      // no current version, so just init it.
      this.set_version(id, -1);
      return;
    }
    version = (version + delta) % versions.size;
    if (version < 0) {
      version += versions.size;
    }
    this.set_version(id, version);
  };

  set_changes_mode = (id: string, changes_mode: boolean): void => {
    for (const actions of [this, this.ambient_actions]) {
      if (actions == null) continue;
      const node = actions._get_frame_node(id);
      if (node == null) continue;
      changes_mode = !!changes_mode;
      actions.set_frame_tree({ id, changes_mode });
      if (
        changes_mode &&
        (node.get("version0") == null || node.get("version1") == null)
      ) {
        let version1 = node.get("version");
        if (version1 == null) {
          const versions = this.store.get("versions");
          version1 = versions.size - 1;
        }
        let version0 = version1 - 1;
        if (version0 < 0) {
          version0 += 1;
          version1 += 1;
        }
        actions.set_frame_tree({ id, version0, version1 });
      }
      return;
    }
  };

  setTextMode = (id: string, text_mode: boolean): void => {
    for (const actions of [this, this.ambient_actions]) {
      if (actions == null) continue;
      const node = actions._get_frame_node(id);
      if (node == null) continue;
      text_mode = !!text_mode;
      actions.set_frame_tree({ id, text_mode });
      break;
    }
  };

  setGitMode = async (id: string, git_mode: boolean) => {
    for (const actions of [this, this.ambient_actions]) {
      if (actions == null) continue;
      const node = actions._get_frame_node(id);
      if (node == null) continue;
      const cur = !!node.get("git_mode");
      git_mode = !!git_mode;
      if (cur != git_mode) {
        // actually changing it
        actions.set_frame_tree({ id, git_mode });
        let versions;
        if (git_mode) {
          // also set version to newest on change to git mode
          versions =
            this.store.get("git_versions") ?? (await this.updateGitVersions());
        } else {
          // set version to newest on change from git mode to time travel
          versions = this.store.get("versions");
        }
        if (versions != null) {
          actions.set_frame_tree({ id, version: versions.size - 1 });
        }
      }
      break;
    }
  };

  setVersions = (id: string, version0: number, version1: number): void => {
    for (const actions of [this, this.ambient_actions]) {
      const node = actions?._get_frame_node(id);
      if (node == null) {
        continue;
      }
      const versions = node.get("git_mode")
        ? this.store.get("git_versions")
        : this.store.get("versions");
      if (versions == null) {
        // not configured.
        return;
      }
      if (version0 >= version1) {
        version0 = version1 - 1;
      }
      if (version0 >= versions.size) {
        version0 = versions.size - 1;
      }
      if (version0 < 0) {
        version0 = 0;
      }
      if (version1 >= versions.size) {
        version1 = versions.size - 1;
      }
      if (version1 < 0) {
        version1 = 0;
      }
      actions?.set_frame_tree({ id, version0, version1 });
      return;
    }
  };

  open_file = async (): Promise<void> => {
    const actions = this.redux.getProjectActions(this.project_id);
    await actions.open_file({ path: this.docpath, foreground: true });
  };

  // Revert the live version of the document to a specific version */
  revert = async (id: string, version: Date, doc: Document): Promise<void> => {
    const { syncdoc } = this;
    if (syncdoc == null) {
      return;
    }
    const node = this.getFrameNodeGlobal(id);
    syncdoc.commit();
    if (node.get("git_mode")) {
      syncdoc.from_str(doc.to_str());
    } else {
      syncdoc.revert(version);
    }
    await syncdoc.commit();
    await this.open_file();
    syncdoc.emit("change");
  };

  open_snapshots = (): void => {
    this.redux.getProjectActions(this.project_id).open_directory(".snapshots");
  };

  exportEditHistory = async (): Promise<string> => {
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
      const git_versions = List<Date>(versions);
      this.setState({
        git: versions.length > 0,
        git_versions,
      });
      this.ensureSelectedVersionsAreConsistent({ git_versions });
      return git_versions;
    } catch (_err) {
      // Do NOT report error -- instead, disable git mode.  This should
      // happen if the file is not in a git repo.
      this.setState({ git: false });
      return;
    }
  };

  private gitShow = async (version: Date): Promise<string | undefined> => {
    const h = this.gitLog[version.valueOf()]?.hash;
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

  gitNames = (version0: number, version1: number): string[] => {
    const versions = this.store.get("git_versions");
    if (versions == null) {
      return [];
    }
    const v0 = versions.get(version0)?.valueOf();
    const v1 = versions.get(version1)?.valueOf();
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
    const versions = this.store.get("git_versions");
    if (versions == null) {
      return;
    }
    const t = versions.get(version)?.valueOf();
    return this.gitLog[`${t}`]?.subject;
  };

  gitDoc = async (version: Date): Promise<ViewDocument | undefined> => {
    const str = await this.gitShow(version);
    if (str == null) {
      return undefined;
    }
    return new ViewDocument(this.docpath, str);
  };
}

export { TimeTravelActions as Actions };
