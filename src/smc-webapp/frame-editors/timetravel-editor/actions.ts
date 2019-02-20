/*
TimeTravel Editor Actions
*/

import { FrameTree } from "../frame-tree/types";
import { Actions } from "../code-editor/actions";

const { open_existing_sync_document } = require("../../webapp_client");

import { callback2, once } from "smc-util/async-utils";
import { filename_extension, path_split } from "smc-util/misc2";
import { meta_file } from "smc-util/misc";

interface TimeTravelState {}

export class TimeTravelActions extends Actions<TimeTravelState> {
  private path: string;
  private ext: string;
  private open_file_path: string;

  public _raw_default_frame_tree(): FrameTree {
    return { type: "time_travel" };
  }

  public async _init(): void {
    if (this.is_public) {
      // What to do? -- definitely don't try to load history
      return;
    }
    this.init_paths();
    await this.init_syncdoc();
  }

  private init_paths(): void {
    //   @filename = "path/to/.file.time-travel"
    const s = path_split(this.filename);
    this.path = s.tail.slice(1, s.tail.length - ".time-travel".length);
    this.open_file_path = this.path;

    if (s.head) {
      this.open_file_path = s.head + "/" + this.path;
    } else {
      this.open_file_path = this.path;
    }

    this.ext = filename_extension(this.path);

    if (this.ext === "ipynb") {
      if (this.is_jupyter_classic()) {
        this.path = `.${this.path}${
          require("../../editor_jupyter").IPYTHON_SYNCFILE_EXTENSION
        }`;
      } else {
        this.path = meta_file(this.path, "jupyter2");
      }
    }
    if (s.head) {
      this.path = s.head + "/" + this.path;
    }
  }

  private is_jupyter_classic(): boolean {
    // TODO
    throw Error("not implemented");
  }

  private async init_syncdoc(): Promise<void> {
    this.syncstring = await callback2(open_existing_sync_document, {
      project_id: this.project_id,
      path: this.path,
      persistent: this.ext === "ipynb" || this.ext === "sagews" // ugly for now...
    });

    await once(this.syncstring, "ready");
  }
}
