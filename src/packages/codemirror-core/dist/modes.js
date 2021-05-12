"use strict";
//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################
Object.defineProperty(exports, "__esModule", { value: true });
/*
Load javascript support for all modes that we support in CoCalc.

NOTE: This is used by the share server, so we can't load css or other stuff
that shouldn't also be used on the backend.
*/
require("codemirror/mode/clike/clike");
require("codemirror/mode/clojure/clojure");
require("codemirror/mode/cobol/cobol");
require("codemirror/mode/coffeescript/coffeescript");
require("codemirror/mode/commonlisp/commonlisp");
require("codemirror/mode/css/css");
require("codemirror/mode/diff/diff");
require("codemirror/mode/dockerfile/dockerfile");
require("codemirror/mode/dtd/dtd");
require("codemirror/mode/ecl/ecl");
require("codemirror/mode/eiffel/eiffel");
require("codemirror/mode/elm/elm");
require("codemirror/mode/erlang/erlang");
require("codemirror/mode/fortran/fortran");
require("codemirror/mode/gfm/gfm");
require("codemirror/mode/go/go");
require("codemirror/mode/groovy/groovy");
require("codemirror/mode/haskell/haskell");
require("codemirror/mode/haxe/haxe");
require("codemirror/mode/htmlembedded/htmlembedded");
require("codemirror/mode/htmlmixed/htmlmixed");
require("codemirror/mode/http/http");
require("codemirror/mode/javascript/javascript");
require("codemirror/mode/jinja2/jinja2");
require("codemirror/mode/jsx/jsx");
require("codemirror/mode/julia/julia");
require("codemirror/mode/livescript/livescript");
require("codemirror/mode/lua/lua");
require("codemirror/mode/markdown/markdown");
require("codemirror/mode/nginx/nginx");
require("codemirror/mode/ntriples/ntriples");
require("codemirror/mode/octave/octave");
require("codemirror/mode/pascal/pascal");
require("codemirror/mode/pegjs/pegjs");
require("codemirror/mode/perl/perl");
require("codemirror/mode/php/php");
require("codemirror/mode/pig/pig");
require("codemirror/mode/properties/properties");
require("codemirror/mode/pug/pug");
require("codemirror/mode/r/r");
require("codemirror/mode/ruby/ruby");
require("codemirror/mode/rust/rust");
require("codemirror/mode/sass/sass");
require("codemirror/mode/scheme/scheme");
require("codemirror/mode/shell/shell");
require("codemirror/mode/sieve/sieve");
require("codemirror/mode/smalltalk/smalltalk");
require("codemirror/mode/smarty/smarty");
require("codemirror/mode/sparql/sparql");
require("codemirror/mode/sql/sql");
require("codemirror/mode/stex/stex");
require("codemirror/mode/tiddlywiki/tiddlywiki");
require("codemirror/mode/tiki/tiki");
require("codemirror/mode/toml/toml");
require("codemirror/mode/vb/vb");
require("codemirror/mode/vbscript/vbscript");
require("codemirror/mode/velocity/velocity");
require("codemirror/mode/verilog/verilog");
require("codemirror/mode/xml/xml");
require("codemirror/mode/xquery/xquery");
require("codemirror/mode/yaml/yaml");
require("codemirror/mode/yaml-frontmatter/yaml-frontmatter");
require("codemirror/mode/z80/z80");
/*
* In mode/python/python I add our unicode output character to be a comment starter:

      // Handle Comments
      if (ch == "#"  || ch == "\uFE21") {

Also, it's critical to fix a bug by replacing the state function by

  function top(state) {
    if (state.scopes.length == 0) {
        return {type:"undefined", offset:0};  // better than totally crashing
    }
    return state.scopes[state.scopes.length - 1];
  }
*/
require("./mode/python");
require("./mode/makefile");
// In ReST mode/rst/rst, add Sage support:
//  var rx_examples = new RegExp('^\\s+(?:>>>|sage:|In \\[\\d+\\]:)\\s');
require("./mode/rst");
//  Modify the coffeescript mode to support cjsx.
require("./mode/coffeescript2");
require("./mode/less");
require("./mode/ocaml");
require("./mode/pari");
require("./mode/mediawiki/mediawiki");
require("./mode/lean");
require("./mode/ada");
require("./mode/custom-modes");
