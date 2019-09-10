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
  private syncdoc: SyncDoc;

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
    this.syncdoc.on("change", debounce(this.syncdoc_changed.bind(this), 1000));
    await once(this.syncdoc, "ready");
  }

  private syncdoc_changed(): void {
    this.setState({ versions: List<Date>(this.syncdoc.versions()) });
  }
}
