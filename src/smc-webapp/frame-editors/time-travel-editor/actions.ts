/*
TimeTravel Frame Editor Actions
*/
import { debounce } from "lodash";
import { List } from "immutable";
import { callback2, once } from "smc-util/async-utils";
import { filename_extension, keys } from "smc-util/misc2";
import { SyncDoc } from "smc-util/sync/editor/generic/sync-doc";
const { webapp_client } = require("../../webapp_client");
import { Actions, CodeEditorState } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { export_to_json } from "./export-to-json";

const EXTENSION = ".time-travel";

interface TimeTravelState extends CodeEditorState {
  versions: List<Date>;
  loading: boolean;
  has_full_history: boolean;
  docpath: string;
}

export class TimeTravelActions extends Actions<TimeTravelState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  private docpath: string;
  private docext: string;
  private syncdoc?: SyncDoc;
  private first_load: boolean = true;

  public _init2(): void {
    this.docpath = this.path.slice(0, this.path.length - EXTENSION.length);
    this.docext = filename_extension(this.docpath);
    this.setState({
      versions: List([]),
      loading: true,
      has_full_history: false,
      docpath: this.docpath
    });
    this.init_syncdoc();
  }

  public _raw_default_frame_tree(): FrameTree {
    return { type: "time_travel" };
  }

  private async init_syncdoc(): Promise<void> {
    const persistent = this.docext == "ipynb" || this.docext == "sagews"; // ugly for now (?)
    this.syncdoc = await callback2(webapp_client.open_existing_sync_document, {
      project_id: this.project_id,
      path: this.docpath,
      persistent
    });
    if (this.syncdoc == null) return;
    this.syncdoc.on("change", debounce(this.syncdoc_changed.bind(this), 1000));
    await once(this.syncdoc, "ready");
    this.setState({
      loading: false,
      has_full_history: this.syncdoc.has_full_history()
    });
  }

  private init_frame_tree(versions): void {
    // make sure all the version and version ranges are valid...
    const max = versions.size - 1;
    for (let id in this._get_leaf_ids()) {
      const node = this._get_frame_node(id);
      if (node == null) continue;
      for (let x of ["version", "version0", "version1"]) {
        let n: number | undefined = node.get(x);
        if (n == null || n > max || n < 0) {
          // make it max except in the case of "version0"
          // when we want it to be one less than version1, which
          // will be max.
          n = x == "version0" ? Math.max(0, max - 1) : max;
          this.set_frame_tree({ id, [x]: n });
        }
      }
    }
  }

  public async load_full_history(): Promise<void> {
    if (this.store.get("has_full_history") || this.syncdoc == null) return;
    await this.syncdoc.load_full_history(); // todo -- error reporting ...?
    this.setState({ has_full_history: true });
    this.syncdoc_changed(); // load new versions list.
  }

  private syncdoc_changed(): void {
    if (this.syncdoc == null) return;
    const versions = List<Date>(this.syncdoc.all_versions());
    this.ensure_versions_are_stable(versions);
    this.setState({ versions });
    if (this.first_load) {
      this.first_load = false;
      this.init_frame_tree(versions);
    }
  }

  // For each store version in a frame node, check to see
  // if the Date changes from the current versions to the new
  // ones and if so, fix it. We do this because if you're looking
  // at time t at position p, and somebody inserts a new version
  // before position p ... then suddenly position p is no longer
  // time t, which would be confusing.
  private ensure_versions_are_stable(new_versions): void {
    // TODO
    new_versions = new_versions;
  }

  // Get the given version of the document.
  public get_doc(version: Date): any {
    if (this.syncdoc == null) return;
    return this.syncdoc.version(version);
  }

  public get_account_ids(version0: number, version1: number): string[] {
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
  }

  public set_version(id: string, version: number): void {
    if (this._get_frame_node(id) == null) {
      throw Error(`no frame with id ${id}`);
    }
    if (typeof version != "number") {
      // be extra careful
      throw Error("version must be a number");
    }
    const versions = this.store.get("versions");
    if (versions == null || versions.size == 0) return;
    if (version == -1 || version >= versions.size) {
      version = versions.size - 1;
    } else if (version < 0) {
      version = 0;
    }
    this.set_frame_tree({ id, version });
  }

  public step(id: string, delta: number): void {
    const node = this._get_frame_node(id);
    if (node == null) {
      throw Error(`no frame with id ${id}`);
    }
    if (node.get("changes_mode")) {
      this.set_versions(
        id,
        node.get("version0") + delta,
        node.get("version1") + delta
      );
      return;
    }
    const versions = this.store.get("versions");
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
  }

  public set_changes_mode(id: string, changes_mode: boolean): void {
    const node = this._get_frame_node(id);
    if (node == null) {
      throw Error(`no frame with id ${id}`);
    }
    changes_mode = !!changes_mode;
    this.set_frame_tree({ id, changes_mode });
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
      this.set_frame_tree({ id, version0, version1 });
    }
  }

  public set_versions(id: string, version0: number, version1: number): void {
    if (this._get_frame_node(id) == null) {
      throw Error(`no frame with id ${id}`);
    }
    const versions = this.store.get("versions");
    if (version0 >= version1) {
      version0 = version1 - 1;
    }
    if (version0 >= versions.size) version0 = versions.size - 1;
    if (version0 < 0) version0 = 0;
    if (version1 >= versions.size) version1 = versions.size - 1;
    if (version1 < 0) version1 = 0;
    this.set_frame_tree({ id, version0, version1 });
  }

  public async open_file(): Promise<void> {
    const actions = this.redux.getProjectActions(this.project_id);
    await actions.open_file({ path: this.docpath, foreground: true });
  }

  // Revert the live version of the document to a specific version */
  public async revert(version: Date): Promise<void> {
    if (this.syncdoc == null) return;
    this.syncdoc.revert(version);
    this.syncdoc.commit();
    await this.open_file();
    if (this.syncdoc == null) return;
    this.syncdoc.emit("change");
  }

  public open_snapshots(): void {
    this.redux.getProjectActions(this.project_id).open_directory(".snapshots");
  }

  public async export(): Promise<string> {
    const path = await export_to_json(
      this.syncdoc,
      this.docpath,
      this.project_id
    );
    const actions = this.redux.getProjectActions(this.project_id);
    await actions.open_file({ path, foreground: true });
    return path;
  }
}
