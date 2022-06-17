/*

We load the ancient jQuery templates into the DOM.  Yes, there are still 3 major editors
that haven't been rewritten using React:

- Sage Worksheets
- Terminal for mobile (mainly due to shortcomings of xterm.js?)
- Jupyter classic in an iframe with sync/timetravel.

*/

declare var $;

const templates_html =
  require("../console.html").default +
  require("../editor.html").default +
  require("../jupyter.html").default +
  require("../sagews/interact.html").default +
  require("../sagews/3d.html").default +
  require("../sagews/d3.html").default;

$("body").append(templates_html);

export {};
