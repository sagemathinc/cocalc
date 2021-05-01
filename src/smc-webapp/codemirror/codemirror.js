/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Loading and configuring the codemirror editor

window.CodeMirror = CodeMirror = require("codemirror");

require("codemirror/addon/mode/overlay.js");
require("codemirror/addon/selection/active-line.js");
require("codemirror/addon/comment/comment.js");

require("codemirror/addon/dialog/dialog.js");
require("codemirror/addon/dialog/dialog.css");

require("codemirror/addon/display/placeholder.js");

require("codemirror/addon/search/searchcursor.js");
require("codemirror/addon/search/jump-to-line.js");
require("codemirror/addon/search/matchesonscrollbar.js");

require("codemirror/addon/edit/matchbrackets.js");
require("codemirror/addon/edit/closebrackets.js");
require("codemirror/addon/edit/trailingspace.js");
require("codemirror/addon/edit/continuelist.js");
require("codemirror/addon/edit/matchtags.js");
require("codemirror/addon/edit/closetag.js");
require("codemirror/addon/wrap/hardwrap.js");
require("codemirror/addon/runmode/runmode.js");
require("codemirror/addon/fold/brace-fold.js");
require("codemirror/addon/fold/foldcode.js");
require("codemirror/addon/fold/foldgutter.js");
require("codemirror/addon/fold/foldgutter.css");

require("codemirror/addon/fold/markdown-fold.js");
require("codemirror/addon/fold/comment-fold.js");
require("codemirror/addon/fold/indent-fold.js");
require("codemirror/addon/fold/xml-fold.js");
require("codemirror/addon/hint/anyword-hint.js");
require("codemirror/addon/hint/css-hint.js");
require("codemirror/addon/hint/html-hint.js");
require("codemirror/addon/hint/javascript-hint.js");

require("codemirror/addon/hint/show-hint.js");

require("codemirror/addon/hint/sql-hint.js");
require("codemirror/addon/hint/xml-hint.js");

require("./modes");

// Keyboard bindings
require("codemirror/keymap/vim.js");
require("codemirror/keymap/emacs.js");
require("codemirror/keymap/sublime.js");

// For some reason python-hint.js got removed from codemirror itself
require("./addon/hint/python-hint.js");

require("./addon/smc-search.js");
//require('codemirror/addon/search/search.js')

require("./styles");

// Have to strengthen this to "fight off" the adverse buggy global
// impact of some of the above themes... (namely idea and darcula
// at time of writing).
require("./addon/show-hint.css");

// Various extentions that I wrote since I needed them to implement CoCalc
require("./addon/delete-trailing-whitespace");
require("./addon/fill-paragraph");

require("./extensions");
