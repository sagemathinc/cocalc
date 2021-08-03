/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is meant entirely for use in development, to easily play with
and benchmark the backend rendering code purely from a node terminal
without having to start a web server at all.
*/

log = (...args) => console.log(...args);

log("setting up jsDOM");
require("../jsdom-support");

log("loading @cocalc/frontend");
const { HTML } = require("@cocalc/frontend/r_misc");
const { React } = require("@cocalc/frontend/app-framework");

exports.HTML = HTML;
exports.c = function () {
  return React.createElement(
    "div",
    null,
    React.createElement(HTML, { value: "$x^3$" })
  );
};

log("creating render function");
exports.render = require("react-dom/server").renderToStaticMarkup;
