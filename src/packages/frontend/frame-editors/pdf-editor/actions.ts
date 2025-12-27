/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
PDF Editor Actions
*/

import {
  BaseEditorActions as BaseActions,
  CodeEditorState,
} from "../base-editor/actions-base";
import { print_html } from "../frame-tree/print";
import { FrameTree } from "../frame-tree/types";
import { raw_url } from "../frame-tree/util";

import { PDFWatcher } from "../latex-editor/pdf-watcher";
import { ScrollIntoViewMap, ScrollIntoViewRecord } from "../latex-editor/types";
import { pdf_path } from "../latex-editor/util";

import { EDITOR_SPEC } from "./editor";

interface PDFEditorState extends CodeEditorState {
  scroll_pdf_into_view: ScrollIntoViewMap;
  zoom_page_width: string;
  zoom_page_height: string;
}

export class Actions extends BaseActions<PDFEditorState> {
  // No need to open any syncstring for pdfjs -- they don't use database sync
  // at all right now; might somebody for annotation though.
  protected doctype: string = "none";

  // PDF file watcher - watches directory for PDF file changes
  private pdf_watcher?: PDFWatcher;

  _raw_default_frame_tree(): FrameTree {
    return { type: "pdfjs_canvas" };
  }

  _init2(): void {
    if (!this.is_public) {
      this.reload("");
      this._init_pdf_directory_watcher();
    }
  }

  // Watch the directory containing the PDF file for changes
  private async _init_pdf_directory_watcher(): Promise<void> {
    const pdfPath = pdf_path(this.path);
    this.pdf_watcher = new PDFWatcher(
      this.project_id,
      pdfPath,
      this.reload.bind(this, ""),
    );
    await this.pdf_watcher.init();
  }

  close(): void {
    if (this.pdf_watcher != null) {
      this.pdf_watcher.close();
      this.pdf_watcher = undefined;
    }
    super.close();
  }

  reload(_: string /* id not used here */): void {
    const now: number = Date.now();
    let type: string;
    for (type in EDITOR_SPEC) {
      this.set_reload(type, now);
    }
  }

  print(): void {
    this.print_pdf();
  }

  print_pdf(): void {
    print_html({ src: raw_url(this.project_id, this.path) });
  }

  zoom_page_width(id: string): void {
    this.setState({ zoom_page_width: id });
  }

  zoom_page_height(id: string): void {
    this.setState({ zoom_page_height: id });
  }

  scroll_pdf_into_view(page: number, y: number, id: string): void {
    this.setState({
      scroll_pdf_into_view: new ScrollIntoViewRecord({
        page: page,
        y: y,
        id: id,
      }),
    });
  }
}
