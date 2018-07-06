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
  _raw_default_frame_tree(): FrameTree {
    return { type: "pdfjs_canvas" };
  }

  reload(id: string): void {
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
