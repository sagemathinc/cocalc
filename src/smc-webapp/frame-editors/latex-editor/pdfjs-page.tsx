/*
Manages rendering a single page using either SVG or Canvas
*/

import { React, Rendered, Component } from "../../app-framework";

import { is_different } from "../generic/misc";

import { NonloadedPage } from "./pdfjs-nonloaded-page";
import { SVGPage } from "./pdfjs-svg-page";
import { CanvasPage } from "./pdfjs-canvas-page";

import {
  PDFAnnotationData,
  PDFPageProxy,
  PDFDocumentProxy
} from "pdfjs-dist/webpack";

import { SyncHighlight } from "./pdfjs-annotation";

export const PAGE_GAP: number = 20;

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
      is_different(
        this.props,
        next_props,
        ["n", "renderer", "scale", "sync_highlight"]
      ) ||
      this.props.doc.pdfInfo.fingerprint !== next_props.doc.pdfInfo.fingerprint
    );
  }

  render_content(): Rendered {
    if (!this.props.page) return;
    const f = annotation => {
      this.click_annotation(annotation);
    };
    if (this.props.renderer == "none") {
      return <NonloadedPage page={this.props.page} scale={this.props.scale} />;
    } else if (this.props.renderer == "svg") {
      return (
        <SVGPage
          page={this.props.page}
          scale={this.props.scale}
          click_annotation={f}
          sync_highlight={this.props.sync_highlight}
        />
      );
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
          height: `${PAGE_GAP}px`
        }}
      >
        Page {this.props.n}
      </div>
    );
  }

  click(event): void {
    if (!this.props.actions.synctex_pdf_to_tex) {  // no support for synctex for whatever is using this.
      return;
    }
    let x: number = event.nativeEvent.offsetX / this.props.scale;
    let y: number = event.nativeEvent.offsetY / this.props.scale;
    this.props.actions.synctex_pdf_to_tex(this.props.n, x, y);
  }

  async click_annotation(annotation: PDFAnnotationData): Promise<void> {
    if (annotation.url) {
      // Link to an external URL.
      // TODO: make it work for cocalc URL's, e.g., cocalc.com...
      let win = window.open(annotation.url, "_blank");
      if (win) {
        win.focus();
      }
      return;
    }
    if (annotation.dest) {
      // Internal link within the document.
      let dest = await this.props.doc.getDestination(annotation.dest);
      let page: number = (await this.props.doc.getPageIndex(dest[0])) + 1;
      let page_height = this.props.page.pageInfo.view[3];
      this.props.actions.scroll_pdf_into_view(
        page,
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
        <div
          style={{ background: "#525659" }}
          onDoubleClick={e => this.click(e)}
        >
          {this.render_content()}
        </div>
      </div>
    );
  }
}
