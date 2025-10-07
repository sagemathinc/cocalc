/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render the annotation layer on top of a page.

The page itself could be rendered with either SVG or Canvas.

NOTE: For now we only render **link** annotations, and handle internal and external links.
We do NOT render any other annotations (e.g., notes, etc.), as would be produced code
like is here:  https://tex.stackexchange.com/questions/6306/how-to-annotate-pdf-files-generated-by-pdflatex
*/

import { Util } from "pdfjs-dist";
import type { PDFAnnotationData, PDFPageProxy } from "pdfjs-dist/webpack.mjs";
import { useEffect, useRef, useState } from "react";

import { useIsMountedRef } from "@cocalc/frontend/app-framework";

const HIGHLIGHT_HEIGHT: number = 30;

export interface SyncHighlight {
  y: number;
  until: Date;
}

interface Props {
  page: PDFPageProxy;
  scale: number;
  clickAnnotation: Function;
  // If sync_highlight is set, draw a horizontal yellow highlight around
  // this y position, which fades out over the next few seconds.
  syncHighlight?: SyncHighlight;
}

export default function AnnotationLayer({
  page,
  scale,
  clickAnnotation,
  syncHighlight: sync_highlight_prop,
}: Props) {
  const isMounted = useIsMountedRef();
  const sync_highlight_number = useRef<number>(0);
  const [annotations, set_annotations] = useState<
    PDFAnnotationData[] | undefined
  >(undefined);
  const [sync_highlight, set_sync_highlight] = useState<
    SyncHighlight | undefined
  >(sync_highlight_prop);

  useEffect(() => {
    update_annotations();
  }, [page]);

  // react to changes in props
  useEffect(() => {
    if (sync_highlight_prop != null && sync_highlight_prop != sync_highlight) {
      set_sync_highlight(sync_highlight_prop);
    }
  }, [sync_highlight_prop]);

  // remove highlight after a brief timeout
  useEffect(() => {
    if (sync_highlight != null) {
      const wait_ms = sync_highlight.until.getTime() - Date.now();
      sync_highlight_number.current += 1;
      const shn = sync_highlight_number.current;
      const to = setTimeout(() => {
        if (isMounted.current && sync_highlight_number.current === shn) {
          set_sync_highlight(undefined);
        }
      }, wait_ms);
      return () => clearTimeout(to);
    }
  }, [sync_highlight]);

  async function update_annotations(): Promise<void> {
    try {
      const annotations =
        (await page.getAnnotations()) as unknown as PDFAnnotationData[];
      if (!isMounted.current) return;
      set_annotations(annotations);
    } catch (err) {
      console.error(`pdf.js -- Error updating annotations: #{err}`);
      return;
    }
  }

  function render_sync_highlight(
    scale: number,
    width: number,
    y: number,
  ): React.JSX.Element {
    return (
      <div
        onDoubleClick={(e) => e.stopPropagation()}
        key={"sync"}
        style={{
          position: "absolute",
          top: (y - HIGHLIGHT_HEIGHT / 2) * scale,
          width: width * scale,
          height: HIGHLIGHT_HEIGHT * scale,
          opacity: 0.35,
          background: "yellow",
          border: "1px solid grey",
          boxShadow: "3px 3px 3px 0px #ddd",
          zIndex: 1, // without that, in dark-mode it stays hidden
        }}
      />
    );
  }

  if (annotations == null) {
    return <div />;
  }
  const v: React.JSX.Element[] = [];
  for (const annotation0 of annotations) {
    // NOTE: We have to do this ugly cast to any because the @types for pdfjs are
    // incomplete/wrong for annotations.
    const annotation: any = annotation0 as any;
    if (annotation.subtype != "Link") {
      // We only care about link annotations *right now*, for the purposes of the latex editor.
      console.log("Annotation not implemented", annotation);
      continue;
    }
    const [x1, y1, x2, y2] = Util.normalizeRect(annotation.rect);
    const page_height = page.view[3];
    const left = x1 - 1,
      top = page_height - y2 - 1,
      width = x2 - x1 + 2,
      height = y2 - y1 + 1;

    let border = "";
    if (annotation.borderStyle.width) {
      border = `0.5px solid rgb(${annotation.color[0]}, ${annotation.color[1]}, ${annotation.color[2]})`;
    }

    // Note: this "annotation" in the onClick below is the right one because we use "let"
    // *inside* the for loop above -- I'm not making the typical closure/scoping mistake.
    const elt = (
      <div
        onClick={() => clickAnnotation(annotation)}
        key={annotation.id}
        style={{
          position: "absolute",
          left: left * scale,
          top: top * scale,
          width: width * scale,
          height: height * scale,
          border: border,
          cursor: "pointer",
          zIndex: 1, // otherwise, the yellow sync highlight is above url links
        }}
      />
    );
    v.push(elt);
  }

  // handle highlight which is used for synctex.
  if (sync_highlight !== undefined) {
    v.push(render_sync_highlight(scale, page.view[2], sync_highlight.y));
  }

  return <div style={{ position: "absolute" }}>{v}</div>;
}
