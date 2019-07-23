// Enable transparent server-side requiring of cjsx files.
require("node-cjsx").transform();

// Loading of ts/tsx (?).
require("ts-node").register();

const ReactDOMServer = require("react-dom/server");
const { writeFileSync } = require("fs");
const { join } = require("path");

// The overall procedure is the following:
// 1. render the component (rendering step is defined in the billing.cjsx file) into the webapp-lib folder
// 2. during the "webpack" step, this component is included into a full html page via includes
// look into policies/pricing.html, there is <%= require('html?conservativeCollapse!./_static_pricing_page.html') %>

global["BACKEND"] = true;

// there is a global window object, which is undefined in node.js' world -- we mock it and hope for the best.
global["window"] = {};
// webpack's injected DEBUG flag, we set it to false
global["DEBUG"] = false;
// jQuery mocking until feature.coffee is happy
const $ = (global["$"] = global["window"].$ = function() {});
$.get = function() {};

console.log("render react static pages: loading cocalc frontend library...");
const static_react_pages = [
  [
    require("./billing.cjsx").render_static_pricing_page(),
    "policies/_static_pricing_page.html"
  ],
  //[require('./r_help.cjsx').render_static_about(), '_static_about.html'],
  [require("./r_misc").render_static_footer(), "_static_footer.html"],
  //[require('./r_misc').render_static_sage_preview(), '_static_sage_preview.html'],
  [
    require("./r_help.cjsx").render_static_third_party_software(),
    "_static_third_party_software.html"
  ],
  [
    require("./r_cocalc_about.cjsx").render_static_cocalc_about(),
    "_static_cocalc_about.html"
  ]
];

// Code for static server-side rendering of the subscription options.
// note, that we use renderToStaticMarkup, not renderToString
// (see https://facebook.github.io/react/docs/top-level-api.html#reactdomserver.rendertostaticmarkup)
exports.render_static_react_pages = function() {
  for (let [input, outfile] of static_react_pages) {
    const filename = join("..", "webapp-lib", outfile);
    console.log(`render react static pages: rendering ${filename}...`);
    const html = ReactDOMServer.renderToStaticMarkup(input);
    writeFileSync(filename, html);
  }
};
