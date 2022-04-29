/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a single PDF page using canvas.
*/

import $ from "jquery";
import type { PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack";
import { React, ReactDOM } from "../../app-framework";
import { AnnotationLayer, SyncHighlight } from "./pdfjs-annotation";

interface Props {
  page: PDFPageProxy;
  scale: number;
  click_annotation: Function;
  sync_highlight?: SyncHighlight;
}

export const CanvasPage: React.FC<Props> = React.memo((props: Props) => {
  const { page, scale, click_annotation, sync_highlight } = props;

  const pageRef = React.useRef(null);

  React.useEffect(
    function () {
      render_page();
    },
    [page, scale]
  );

  async function render_page(): Promise<void> {
    if (pageRef.current == null) return;
    const div: HTMLElement = ReactDOM.findDOMNode(pageRef.current);
    const viewport: PDFPageViewport = page.getViewport({
      scale: scale * window.devicePixelRatio,
    });
    const canvas: HTMLCanvasElement = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx == null) {
      console.error(
        "pdf.js -- unable to get a 2d canvas, so not rendering page"
      );
      return;
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
    canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;
    $(div).empty();
    div.appendChild(canvas);
    try {
      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;
    } catch (err) {
      console.error(`pdf.js -- Error rendering canvas page: ${err}`);
      return;
    }
  }

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      <AnnotationLayer
        page={page}
        scale={scale}
        click_annotation={click_annotation}
        sync_highlight={sync_highlight}
      />
      <div ref={pageRef} />
    </div>
  );
});
