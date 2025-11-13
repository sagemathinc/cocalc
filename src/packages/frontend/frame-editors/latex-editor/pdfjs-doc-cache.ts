/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
We cache recently loaded PDF.js docs, so that:

- several frames on the same document only have to load it once
- hiding, then re-showing the document is much faster
- canvas and svg can share the same doc
*/

/*
MAX_PAGES is the maximum number of pages to store in the cache.
I just made this value up to avoid some weird case
where maybe we fail to remove stuff from the cache
and things just grow badly (user has tons of docs open).
*/
const MAX_PAGES = 1000;

import LRU from "lru-cache";
import "pdfjs-dist/webpack.mjs";

import { versions } from "@cocalc/cdn";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

/* IMPORTANT:
 - We do NOT install pdfjs-dist into the @cocalc/frontend module at all though we import it here!!
 - The reason is because it includes its own copy of webpack as a side effect of having its
   own webpack loader included.   Having two copies of webpack obviously doesn't work, since
   they have different state.
 - Instead, pdfjs-dist is installed into packages/static instead.  That works fine.
 - Oh, for some reason pdfjs-dist is shipping built js files with optional chaining in
   them, which causes trouble, so we explicitly use a babel plugin just to deal
   with this package.  That's all in packages/static.
*/
import { getDocument as pdfjs_getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist/webpack.mjs";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";
import { pdf_path } from "./util";
import { getComputeServerId } from "@cocalc/frontend/frame-editors/generic/client";

const options = {
  maxSize: MAX_PAGES,
  sizeCalculation: function (doc: PDFDocumentProxy): number {
    return Math.max(doc.numPages ?? 1, 1);
  },
};

export function url_to_pdf(
  project_id: string,
  path: string,
  reload: number,
): string {
  return raw_url(
    project_id,
    pdf_path(path),
    getComputeServerId({ project_id, path }),
    `param=${reload}`,
  );
}

const doc_cache = new LRU(options);

export const getDocument = reuseInFlight(async function (url: string) {
  let doc: PDFDocumentProxy | undefined = doc_cache.get(url);
  if (doc === undefined) {
    const resDir = `pdfjs-dist-${versions["pdfjs-dist"]}`;
    doc = (await pdfjs_getDocument({
      url,
      cMapUrl: `${appBasePath}/cdn/${resDir}/cmaps/`,
      cMapPacked: true,
      disableStream: true,
      disableAutoFetch: true,
    }).promise) as unknown as PDFDocumentProxy;
    doc_cache.set(url, doc);
  }
  return doc;
});

/*
Call this to remove this given pdf from the cache.
This is called when the reload number *changes*, since then we will
never ever want to see the old pdf.
*/
export function forgetDocument(url: string): void {
  doc_cache.delete(url);
}
