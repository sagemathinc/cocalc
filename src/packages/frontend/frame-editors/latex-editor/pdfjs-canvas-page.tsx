/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Render a single PDF page using canvas.
*/

import { useCallback, useEffect, useRef } from "react";
import type { PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack";
import AnnotationLayer, { SyncHighlight } from "./pdfjs-annotation";
import { useDebouncedCallback } from "use-debounce";

interface Props {
  page: PDFPageProxy;
  scale: number;
  clickAnnotation: Function;
  syncHighlight?: SyncHighlight;
}

export default function CanvasPage({
  page,
  scale,
  clickAnnotation,
  syncHighlight,
}: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScaleRef = useRef<number>(scale);
  const lastRenderScaleRef = useRef<number>(scale);

  const viewport: PDFPageViewport = page.getViewport({
    scale: scale * window.devicePixelRatio,
  });
  const height = `${viewport.height / window.devicePixelRatio}px`;

  const scalePage = useCallback(async (scale) => {
    if (lastScaleRef.current == scale) return;
    const div = divRef.current;
    const canvas = canvasRef.current;
    if (div == null || canvas == null) return;
    lastScaleRef.current = scale;
    const viewport: PDFPageViewport = page.getViewport({
      scale: scale * window.devicePixelRatio,
    });
    canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
    canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;
  }, []);

  const renderPage = useCallback(async (page, scale) => {
    if (divRef.current == null) return;
    lastScaleRef.current = lastRenderScaleRef.current = scale;
    const div = divRef.current;
    const viewport: PDFPageViewport = page.getViewport({
      scale: scale * window.devicePixelRatio,
    });
    const canvas: HTMLCanvasElement = document.createElement("canvas");
    canvasRef.current = canvas;
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
    div.replaceChildren(canvas);
    try {
      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;
    } catch (err) {
      console.error(`pdf.js -- Error rendering canvas page: ${err}`);
      return;
    }
  }, []);

  const debouncedRender = useDebouncedCallback(renderPage, 500);

  useEffect(() => {
    renderPage(page, scale);
  }, [page]);

  useEffect(() => {
    scalePage(scale);
    if (lastRenderScaleRef.current < scale) {
      // upscaling, so may need to render.
      debouncedRender(page, scale);
    } else {
      debouncedRender.cancel();
    }
  }, [scale]);

  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        height,
      }}
    >
      <AnnotationLayer
        page={page}
        scale={scale}
        clickAnnotation={clickAnnotation}
        syncHighlight={syncHighlight}
      />
      <div ref={divRef} />
    </div>
  );
}
