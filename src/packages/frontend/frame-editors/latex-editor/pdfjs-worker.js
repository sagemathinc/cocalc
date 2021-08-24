/*
Setup PDFJS worker.

We do NOT use pdfjs-dist/webpack.js since it does not include a hash
in the worker chunk name, which wreaks havoc on caching.
*/

const pdfjs = require("pdfjs-dist");
const PdfjsWorker = require("pdfjs-dist/build/pdf.worker.js").default;
window.PdfjsWorker = PdfjsWorker;
pdfjs.GlobalWorkerOptions.workerPort = new PdfjsWorker();
