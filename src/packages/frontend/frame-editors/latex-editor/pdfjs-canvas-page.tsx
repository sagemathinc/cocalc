/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render a single PDF page using canvas.
*/

import type { PDFPageProxy, PDFPageViewport } from "pdfjs-dist/webpack.mjs";
import { useCallback, useEffect, useRef } from "react";
import { useDebouncedCallback } from "use-debounce";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { get_dark_mode_config } from "@cocalc/frontend/account/dark-mode";
import AnnotationLayer, { SyncHighlight } from "./pdfjs-annotation";
import TextLayer from "./pdfjs-text";

interface Props {
  page: PDFPageProxy;
  scale: number;
  clickAnnotation: Function;
  syncHighlight?: SyncHighlight;
  disableDarkMode?: boolean;
}

export default function CanvasPage({
  page,
  scale,
  clickAnnotation,
  syncHighlight,
  disableDarkMode = false,
}: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScaleRef = useRef<number>(scale);
  const lastRenderScaleRef = useRef<number>(scale);

  // Get dark mode state and settings
  const other_settings = useTypedRedux("account", "other_settings");
  const isDarkMode = other_settings?.get("dark_mode") ?? false;
  const darkModeConfig = isDarkMode
    ? get_dark_mode_config(other_settings?.toJS())
    : null;

  const viewport: PDFPageViewport = page.getViewport({
    scale: scale * window.devicePixelRatio,
  });
  const height = `${viewport.height / window.devicePixelRatio}px`;

  // Build CSS filter string for dark mode
  const getCssFilter = useCallback((): string => {
    // If dark mode is disabled via prop, don't apply any filter
    if (disableDarkMode || !isDarkMode || !darkModeConfig) {
      return "";
    }

    // Convert brightness and contrast from percentage (0-100) to filter values
    // For brightness: 100% = 1.0 (normal), lower values darken
    // For contrast: 100% = 1.0 (normal), higher values increase contrast
    const brightnessValue = darkModeConfig.brightness / 100;
    const contrastValue = darkModeConfig.contrast / 100;

    // Apply invert(1) to flip colors (white → black, black → white)
    // Then adjust brightness and contrast for fine-tuning
    // Add hue-rotate(180deg) to help preserve color relationships in images
    // This makes the inversion more "natural" for colored content like images/diagrams
    return `invert(1) hue-rotate(180deg) brightness(${brightnessValue}) contrast(${contrastValue})`;
  }, [disableDarkMode, isDarkMode, darkModeConfig]);

  const scalePage = useCallback(
    async (scale) => {
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
      canvas.style.filter = getCssFilter();
    },
    [getCssFilter],
  );

  const renderPage = useCallback(
    async (page, scale) => {
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
          "pdf.js -- unable to get a 2d canvas, so not rendering page",
        );
        return;
      }
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / window.devicePixelRatio}px`;
      canvas.style.height = `${viewport.height / window.devicePixelRatio}px`;
      canvas.style.filter = getCssFilter();
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
    },
    [getCssFilter],
  );

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

  // Update canvas filter when dark mode settings change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.filter = getCssFilter();
    }
  }, [getCssFilter]);

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
      <TextLayer page={page} scale={scale} viewport={viewport} />
    </div>
  );
}
