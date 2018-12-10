/*
PDF Editor Actions
*/

import { FrameTree } from "../frame-tree/types";
import { Actions, CodeEditorState } from "../code-editor/actions";
import { print_html } from "../frame-tree/print";
import { raw_url } from "../frame-tree/util";

import {
  ScrollIntoViewRecord,
  ScrollIntoViewMap
} from "../latex-editor/actions";

import { EDITOR_SPEC } from "./editor";

interface PDFEditorState extends CodeEditorState {
  scroll_pdf_into_view: ScrollIntoViewMap;
  zoom_page_width: string;
  zoom_page_height: string;
}

export class PDFActions extends Actions<PDFEditorState> {
  // No need to open any syncstring for pdfs -- they don't use database sync
  // at all right now; might somebody for annotation though.
  protected doctype: string = "none";

  _raw_default_frame_tree(): FrameTree {
    return { type: "pdfjs_canvas" };
  }

  _init2(): void {
    if (!this.is_public) {
      this.reload("");
    }
  }

  reload(_: string /* id not used here */): void {
    const now: number = new Date().valueOf();
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
        id: id
      })
    });
  }
}
