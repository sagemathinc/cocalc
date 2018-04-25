/*
We cache recently loaded PDF.js docs, so that:

- several frames on the same document only have to load it once
- hiding, then re-showing the document is much faster
- canvas and svg can share the same doc
*/

import { reuseInFlight } from "async-await-utils/hof";

import {
  getDocument as pdfjs_getDocument,
  PDFPromise,
  PDFDocumentProxy
} from "pdfjs-dist/webpack";

const doc_cache = {}; // cached -- change to use an LRU cache, rather than cache everything...

export const getDocument: (
  url: string
) => PDFPromise<PDFDocumentProxy> = reuseInFlight(async function(url) {
  let doc = doc_cache[url];
  if (!doc) {
    doc = doc_cache[url] = await pdfjs_getDocument({
      url: url,
      disableStream: true,
      disableAutoFetch: true
    });
  }
  return doc;
});
