/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rst Editor Actions
*/

import { reuseInFlight } from "async-await-utils/hof";
import { Actions as CodeEditorActions } from "../code-editor/actions";
import { print_html } from "../frame-tree/print";
import { convert } from "./rst2html";
import { raw_url } from "../frame-tree/util";
import { aux_file } from "@cocalc/util/misc";
import { FrameTree } from "../frame-tree/types";

export class Actions extends CodeEditorActions {
  private run_rst2html: Function;
  private _last_rst_hash: string = "";

  _init2(): void {
    if (!this.is_public) {
      this._init_syncstring_value();
      this._init_spellcheck(); // TODO: need to "detex" (?)
      this._init_rst2html();
    } else {
      this._init_value();
    }
  }

  _init_rst2html(): void {
    this.run_rst2html = reuseInFlight(this._run_rst2html.bind(this));

    this._syncstring.on(
      "save-to-disk",
      reuseInFlight(async () => {
        if (this._syncstring == null) return;
        const hash = this._syncstring.hash_of_saved_version();
        if (this._last_rst_hash != hash) {
          this._last_rst_hash = hash;
          await this.run_rst2html();
        }
      })
    );

    this._syncstring.once("ready", this.run_rst2html.bind(this));
  }

  async _run_rst2html(time?: number): Promise<void> {
    this.set_status("Running rst2html...");
    try {
      await convert(this.project_id, this.path, time);
    } catch (err) {
      this.set_error(err);
    } finally {
      this.set_status("");
    }
    this.set_reload("rst");
  }

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm",
        },
        second: {
          type: "rst",
        },
      };
    }
  }

  reload(id: string, hash?: number) {
    const node = this._get_frame_node(id);
    if (!node) return;
    const type = node.get("type");
    if (type === "cm") {
      this._run_rst2html();
    } else {
      // the html editor, which also has an iframe, calls somehow super.reload
      hash = hash || new Date().getTime();
      this.set_reload("rst", hash);
    }
  }

  print(id: string): void {
    const node = this._get_frame_node(id);
    if (!node) return;
    const type = node.get("type");
    if (type === "cm") {
      super.print(id);
      return;
    }
    if (type !== "rst") {
      // no other types support printing
      this.set_error("printing of #{type} not implemented");
      return;
    }

    try {
      print_html({
        src: raw_url(this.project_id, aux_file(this.path, "html")),
      });
    } catch (err) {
      this.set_error(err);
    }
  }
}
