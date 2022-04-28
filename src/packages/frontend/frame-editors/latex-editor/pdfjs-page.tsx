/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Manages rendering a single page using either SVG or Canvas
*/

import { React } from "../../app-framework";
import { is_different } from "@cocalc/util/misc";
import { CanvasPage } from "./pdfjs-canvas-page";
import type {
  PDFAnnotationData,
  PDFPageProxy,
  PDFDocumentProxy,
} from "pdfjs-dist/webpack";
import { SyncHighlight } from "./pdfjs-annotation";

export const PAGE_GAP: number = 8;
export const BG_COL = "#525659";

interface PageProps {
  actions: any;
  id: string;
  n: number;
  doc: PDFDocumentProxy;
  scale: number;
  page: PDFPageProxy;
  sync_highlight?: SyncHighlight;
}

function should_memoize(prev, next) {
  return (
    !is_different(prev, next, ["n", "scale", "page", "sync_highlight"]) &&
    prev.doc.fingerprints[0] === next.doc.fingerprints[0] // [1] is used for editing -- "A (not guaranteed to be) unique ID to identify the PDF document. NOTE: The first element will always be defined for all PDF documents, whereas the second element is only defined for *modified* PDF documents." -- https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html
  );
}

export const Page: React.FC<PageProps> = React.memo((props: PageProps) => {
  const { actions, id, n, doc, scale, page, sync_highlight } = props;

  function render_content() {
    if (!page) return;
    const f = (annotation) => {
      click_annotation(annotation);
    };
    return (
      <CanvasPage
        page={page}
        scale={scale}
        click_annotation={f}
        sync_highlight={sync_highlight}
      />
    );
  }

  function click(event): void {
    if (!actions.synctex_pdf_to_tex) {
      // no support for synctex for whatever is using this.
      return;
    }
    const x: number = event.nativeEvent.offsetX / scale;
    const y: number = event.nativeEvent.offsetY / scale;
    actions.synctex_pdf_to_tex(n, x, y);
  }

  async function click_annotation(
    annotation0: PDFAnnotationData
  ): Promise<void> {
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
      const dest = await (doc as any).getDestination(annotation.dest);
      if (dest == null) {
        console.warn(`Unknown destination ${annotation.dest}`);
        return; // no such destination -- internal inconsistency...
      }

      // again, cast to any because of missing typing.
      const page_index: number = await (doc as any).getPageIndex(dest[0]);
      const page_height = page.view[3];
      actions.scroll_pdf_into_view(page_index + 1, page_height - dest[3], id);
      return;
    }
    console.warn("Unknown annotation link", annotation);
  }

  const viewport = page.getViewport({ scale });

  return (
    <div
      style={{ height: `${PAGE_GAP + viewport.height}px`, background: BG_COL }}
    >
      <div
        style={{
          height: `${viewport.height}px`,
          width: `${viewport.width}px`,
          background: "white",
          margin: "auto",
        }}
        onDoubleClick={(e) => click(e)}
      >
        {render_content()}
      </div>
    </div>
  );
}, should_memoize);
