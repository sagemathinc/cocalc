/*
Manages rendering a single page using either SVG or Canvas
*/

import { React, Rendered, Component } from "../../app-framework";

import { is_different } from "smc-util/misc2";

import { NonloadedPage } from "./pdfjs-nonloaded-page";

import { CanvasPage } from "./pdfjs-canvas-page";

import {
  PDFAnnotationData,
  PDFPageProxy,
  PDFDocumentProxy
} from "pdfjs-dist/webpack";

import { SyncHighlight } from "./pdfjs-annotation";

export const PAGE_GAP: number = 20;
const BG_COL = "#525659";

interface PageProps {
  actions: any;
  id: string;
  n: number;
  doc: PDFDocumentProxy;
  renderer: string;
  scale: number;
  page: PDFPageProxy;
  sync_highlight?: SyncHighlight;
}

export class Page extends Component<PageProps, {}> {
  constructor(props) {
    super(props);
  }

  shouldComponentUpdate(next_props: PageProps): boolean {
    return (
      is_different(this.props, next_props, [
        "n",
        "renderer",
        "scale",
        "sync_highlight"
      ]) || this.props.doc.fingerprint !== next_props.doc.fingerprint
    );
  }

  render_content(): Rendered {
    if (!this.props.page) return;
    const f = annotation => {
      this.click_annotation(annotation);
    };
    if (this.props.renderer == "none") {
      return <NonloadedPage page={this.props.page} scale={this.props.scale} />;
    } else {
      return (
        <CanvasPage
          page={this.props.page}
          scale={this.props.scale}
          click_annotation={f}
          sync_highlight={this.props.sync_highlight}
        />
      );
    }
  }

  render_page_number(): Rendered {
    return (
      <div
        style={{
          textAlign: "center",
          color: "white",
          backgroundColor: BG_COL,
          height: `${PAGE_GAP}px`
        }}
      >
        Page {this.props.n}
      </div>
    );
  }

  click(event): void {
    if (!this.props.actions.synctex_pdf_to_tex) {
      // no support for synctex for whatever is using this.
      return;
    }
    const x: number = event.nativeEvent.offsetX / this.props.scale;
    const y: number = event.nativeEvent.offsetY / this.props.scale;
    this.props.actions.synctex_pdf_to_tex(this.props.n, x, y);
  }

  async click_annotation(annotation0: PDFAnnotationData): Promise<void> {
    // NOTE: We have to do this cast because the @types for pdfjs are incomplete and wrong.
    const annotation: any = annotation0 as any; // TODO
    if (annotation.url) {
      // Link to an external URL.
      // TODO: make it work for cocalc URL's, e.g., cocalc.com...
      const win = window.open(annotation.url, "_blank");
      if (win) {
        win.focus();
      }
      return;
    }
    if (annotation.dest) {
      // Internal link within the document.
      // cast to any because of shortcoming in @types/pdfjs-dist (it's there -- see
      // https://github.com/mozilla/pdf.js/blob/master/src/display/api.js#L643)
      const dest = await (this.props.doc as any).getDestination(
        annotation.dest
      );
      if (dest == null) {
        console.warn(`Unknown destination ${annotation.dest}`);
        return; // no such destination -- internal inconsistency...
      }

      // again, cast to any because of missing typing.
      const page_index: number = await (this.props.doc as any).getPageIndex(
        dest[0]
      );
      const page_height = this.props.page.view[3];
      this.props.actions.scroll_pdf_into_view(
        page_index + 1,
        page_height - dest[3],
        this.props.id
      );
      return;
    }
    console.warn("Unknown annotation link", annotation);
  }

  render() {
    return (
      <div>
        {this.render_page_number()}
        <div style={{ background: BG_COL }} onDoubleClick={e => this.click(e)}>
          {this.render_content()}
        </div>
      </div>
    );
  }
}
