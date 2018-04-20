/*
We cache recently loaded PDF.js docs, so that:

- several frames on the same document only have to load it once
- hiding, then re-showing the document is much faster
- canvas and svg can share the same doc
*/

import { reuseInFlight } from "async-await-utils/hof";

import { getDocument as pdfjs_getDocument } from "pdfjs-dist/webpack";

const cache = {}; // cached -- change to use an LRU cache, rather than cache everything...

export const getDocument = reuseInFlight(async function(url) {
    let doc = cache[url];
    if (!doc) {
        doc = cache[url] = await pdfjs_getDocument({ url: url});
    }
    return doc;
});
