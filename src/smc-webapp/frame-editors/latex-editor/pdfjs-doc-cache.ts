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

import * as LRU from "lru-cache";

import { reuseInFlight } from "async-await-utils/hof";

import {
  getDocument as pdfjs_getDocument,
  PDFPromise,
  PDFDocumentProxy
} from "pdfjs-dist/webpack";

import { raw_url } from "../frame-tree/util";

import { pdf_path } from "./util";

import { encode_path } from "../generic/misc";

const options = {
  max: MAX_PAGES,
  length: function(doc: PDFDocumentProxy): number {
    return doc.numPages;
  }
};

export function url_to_pdf(
  project_id: string,
  path: string,
  reload: number
): string {
  return `${raw_url(project_id, encode_path(pdf_path(path)))}?param=${reload}`;
}

const doc_cache = LRU(options);

export const getDocument: (
  url: string
) => PDFPromise<PDFDocumentProxy> = reuseInFlight(async function(url) {
  let doc: PDFDocumentProxy | undefined = doc_cache.get(url);
  if (doc === undefined) {
    doc = await pdfjs_getDocument({
      url: url,
      disableStream: true,
      disableAutoFetch: true
    });
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
  doc_cache.del(url);
}
