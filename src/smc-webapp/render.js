/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Enable transparent server-side requiring of cjsx files.
require("node-cjsx").transform();

// Loading of ts/tsx.
require("ts-node").register();

const ReactDOMServer = require("react-dom/server");
const { writeFileSync } = require("fs");
const { join } = require("path");

// The overall procedure is the following:
// 1. render the component (rendering step is defined in billing) into the webapp-lib folder
// 2. during the "webpack" step, this component is included into a full html page via includes
// look into policies/pricing.html, there is <%= require('html?conservativeCollapse!./_static_pricing_page.html') %>

global["BACKEND"] = true;

// there is a global window object, which is undefined in node.js' world -- we mock it and hope for the best.
global["window"] = {};
// webpack's injected DEBUG flag, we set it to false
global["DEBUG"] = false;
// jQuery mocking until feature.coffee is happy
const $ = (global["$"] = global["window"].$ = function () {});
$.get = function () {};

console.log("render react static pages: loading cocalc frontend library...");
const static_react_pages = [];

// Code for static server-side rendering of the subscription options.
// note, that we use renderToStaticMarkup, not renderToString
// (see https://facebook.github.io/react/docs/top-level-api.html#reactdomserver.rendertostaticmarkup)
exports.render_static_react_pages = function () {
  for (let [input, outfile] of static_react_pages) {
    const filename = join("..", "webapp-lib", outfile);
    console.log(`render react static pages: rendering ${filename}...`);
    const html = ReactDOMServer.renderToStaticMarkup(input);
    writeFileSync(filename, html);
  }
};
