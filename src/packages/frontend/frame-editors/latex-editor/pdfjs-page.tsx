/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Manages rendering a single page using either SVG or Canvas
*/

import type {
  PDFAnnotationData,
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/webpack.mjs";
import { useRef } from "react";
import { SyncHighlight } from "./pdfjs-annotation";
import CanvasPage from "./pdfjs-canvas-page";

export const PAGE_GAP: number = 8;
export const BG_COL = "#525659";

interface PageProps {
  actions: any;
  id: string;
  n: number;
  doc: PDFDocumentProxy;
  scale: number;
  page: PDFPageProxy;
  syncHighlight?: SyncHighlight;
}

export default function Page({
  actions,
  id,
  n,
  doc,
  scale,
  page,
  syncHighlight,
}: PageProps) {
  const divRef = useRef<HTMLDivElement | null>(null);

  async function clickAnnotation(
    annotation0: PDFAnnotationData,
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
        ref={divRef}
        style={{
          height: `${viewport.height}px`,
          width: `${viewport.width}px`,
          background: "white",
          margin: "auto",
        }}
        onDoubleClick={(event) => {
          const elt = divRef.current;
          if (!actions.synctex_pdf_to_tex || !elt) {
            // no support for synctex for whatever is using this.
            return;
          }
          // we cannot directly use event.nativeEvent.offsetX since user may
          // have double clicked on a span in the text layer, in which case
          // offset would be relative to that span.
          const divRect = elt.getBoundingClientRect();
          const offsetX = event.nativeEvent.clientX - divRect.left;
          const offsetY = event.nativeEvent.clientY - divRect.top;
          const x: number = offsetX / scale;
          const y: number = offsetY / scale;
          actions.synctex_pdf_to_tex(n, x, y, true); // true = manual sync
        }}
      >
        <CanvasPage
          page={page}
          scale={scale}
          clickAnnotation={clickAnnotation}
          syncHighlight={syncHighlight}
        />
      </div>
    </div>
  );
}
