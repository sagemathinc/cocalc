/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
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
import { getDocument as pdfjs_getDocument } from "pdfjs-dist";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist/webpack.mjs";

import { versions } from "@cocalc/cdn";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";
import { getComputeServerId } from "@cocalc/frontend/frame-editors/generic/client";
import { pdf_path } from "./util";

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
// Track pending pdf.js loads separately from the resolved document cache so a
// timed-out/stuck load can be explicitly destroyed and not reused forever.
const inflight: Record<
  string,
  {
    loadingTask: PDFDocumentLoadingTask;
    promise: Promise<PDFDocumentProxy>;
  }
> = {};

export async function getDocument(url: string): Promise<PDFDocumentProxy> {
  let doc: PDFDocumentProxy | undefined = doc_cache.get(url);
  if (doc === undefined) {
    const existing = inflight[url];
    if (existing != null) {
      return await existing.promise;
    }

    const resDir = `pdfjs-dist-${versions["pdfjs-dist"]}`;
    const loadingTask = pdfjs_getDocument({
      url,
      cMapUrl: `${appBasePath}/cdn/${resDir}/cmaps/`,
      cMapPacked: true,
      disableStream: true,
      disableAutoFetch: true,
    }) as unknown as PDFDocumentLoadingTask;
    const entry = {
      loadingTask,
      promise: undefined as unknown as Promise<PDFDocumentProxy>,
    };
    entry.promise = loadingTask.promise.then(
      (loaded) => {
        const resolved = loaded as unknown as PDFDocumentProxy;
        if (inflight[url] === entry) {
          delete inflight[url];
          doc_cache.set(url, resolved);
        }
        return resolved;
      },
      (err) => {
        if (inflight[url] === entry) {
          delete inflight[url];
        }
        throw err;
      },
    );
    inflight[url] = entry;
    doc = await entry.promise;
  }
  return doc;
}

/*
Call this to remove this given pdf from the cache.
This is called when the reload number *changes*, since then we will
never ever want to see the old pdf.
*/
export function forgetDocument(url: string): void {
  doc_cache.delete(url);
  const entry = inflight[url];
  if (entry != null) {
    delete inflight[url];
    // Dropping the inflight entry is enough to let the next caller start a
    // fresh load. We intentionally do not destroy the shared pdf.js loading
    // task here, since other viewers may still be awaiting the same URL.
  }
}
