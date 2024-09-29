/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Render the text layer on top of a page to support selection.

How the hell did I figure this code out?  First, there is nightmare of misleading and
useless outdated google hits from the last 10+ years.  Finally, searching the
pdfjs git repo yielded this, which was helpful, which is I guess how this is
implemented for their own viewer:


https://github.com/mozilla/pdf.js/blob/a7e1bf64c4c7a42c7577ce9490054faa1c4eda99/web/text_layer_builder.js#L40


This wasn't helpful:

https://github.com/mozilla/pdf.js/blob/a7e1bf64c4c7a42c7577ce9490054faa1c4eda99/examples/text-only/pdf2svg.mjs#L24
*/

import type { PDFPageProxy } from "pdfjs-dist/webpack.mjs";
import { useEffect, useRef } from "react";
import { TextLayer } from "pdfjs-dist";
import "./pdfjs-text.css";

interface Props {
  page: PDFPageProxy;
  scale: number;
  viewport;
}

export default function PdfjsTextLayer({ page, scale, viewport }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);

  //   useEffect(() => {
  //     (async () => setTextContent(await page.getTextContent()))();
  //   }, [page]);

  useEffect(() => {
    const elt = divRef.current;
    if (!elt) {
      return;
    }
    (async () => {
      const t = new TextLayer({
        textContentSource: page.streamTextContent({
          includeMarkedContent: true,
          disableNormalization: true,
        }),
        container: elt,
        viewport,
      });
      elt.innerHTML = "";
      await t.render();
    })();
  }, [page, scale]);

  return (
    <div
      ref={divRef}
      style={{ "--scale-factor": scale } as any}
      className="cocalc-pdfjs-text-layer"
    />
  );
}
