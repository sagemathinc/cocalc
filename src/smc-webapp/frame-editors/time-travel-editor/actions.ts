/*
TimeTravel Frame Editor Actions
*/
import { debounce } from "lodash";
import { List } from "immutable";
import { callback2, once } from "smc-util/async-utils";
import { filename_extension } from "smc-util/misc2";
import { SyncDoc } from "smc-util/sync/editor/generic/sync-doc";
const { webapp_client } = require("../../webapp_client");
import { Actions, CodeEditorState } from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";

const EXTENSION = ".time-travel";

interface TimeTravelState extends CodeEditorState {
  versions: List<Date>;
}

export class TimeTravelActions extends Actions<TimeTravelState> {
  protected doctype: string = "none"; // actual document is managed elsewhere
  private docpath: string;
  private docext: string;
  private syncdoc?: SyncDoc;

  public _init2(): void {
    this.docpath = this.path.slice(0, this.path.length - EXTENSION.length);
    this.docext = filename_extension(this.docpath);
    this.setState({ versions: List([]) });
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
  }

  private syncdoc_changed(): void {
    if (this.syncdoc == null) return;
    this.setState({ versions: List<Date>(this.syncdoc.versions()) });
  }

  // Get the given version of the document.
  public get_doc(version: Date): any {
    if (this.syncdoc == null) return;
    return this.syncdoc.version(version);
  }

  set_version(id: string, version: Date): void {
    if (this._get_frame_node(id) == null) {
      throw Error(`no frame with id ${id}`);
    }
    // valueOf --- store the number so JSON's fine.
    this.set_frame_tree({ id, version: version.valueOf() });
  }

  step(id: string, delta: number): void {
    const node = this._get_frame_node(id);
    if (node == null) {
      throw Error(`no frame with id ${id}`);
    }
    const versions = this.store.get("versions");
    let version = node.get("version");
    if (version == null) {
      // no current version, so just init it.
      if (versions != null) {
        version = versions.get(-1);
        if (version != null) this.set_version(id, version);
      }
      return;
    }
    // TODO: store an index so don't have to do indexOf here... update index in syncdoc_changed; or store Date and position
    // or store the version as the index and in syncdoc_changed fix it in case something gets inserted.
    let n = versions.indexOf(version);
    if (n == -1) {
      // just initialize
      n = versions.size - 1;
    }
    n += delta;
    if (n >= versions.size) {
      n = versions.size - 1;
    } else if (n < 0) {
      n = 0;
    }
    version = versions.get(n);
    if (version != null) this.set_version(id, version);
  }
}
