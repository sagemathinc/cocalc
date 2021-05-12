//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

/*
Load javascript support for all modes that we support in CoCalc.

NOTE: This is used by the share server, so we can't load css or other stuff
that shouldn't also be used on the backend.
*/

import "codemirror/mode/clike/clike";
import "codemirror/mode/clojure/clojure";
import "codemirror/mode/cobol/cobol";
import "codemirror/mode/coffeescript/coffeescript";
import "codemirror/mode/commonlisp/commonlisp";
import "codemirror/mode/css/css";
import "codemirror/mode/diff/diff";
import "codemirror/mode/dockerfile/dockerfile";
import "codemirror/mode/dtd/dtd";
import "codemirror/mode/ecl/ecl";
import "codemirror/mode/eiffel/eiffel";
import "codemirror/mode/elm/elm";
import "codemirror/mode/erlang/erlang";
import "codemirror/mode/fortran/fortran";
import "codemirror/mode/gfm/gfm";
import "codemirror/mode/go/go";
import "codemirror/mode/groovy/groovy";
import "codemirror/mode/haskell/haskell";
import "codemirror/mode/haxe/haxe";
import "codemirror/mode/htmlembedded/htmlembedded";
import "codemirror/mode/htmlmixed/htmlmixed";
import "codemirror/mode/http/http";
import "codemirror/mode/javascript/javascript";
import "codemirror/mode/jinja2/jinja2";
import "codemirror/mode/jsx/jsx";
import "codemirror/mode/julia/julia";
import "codemirror/mode/livescript/livescript";
import "codemirror/mode/lua/lua";
import "codemirror/mode/markdown/markdown";
import "codemirror/mode/nginx/nginx";
import "codemirror/mode/ntriples/ntriples";
import "codemirror/mode/octave/octave";
import "codemirror/mode/pascal/pascal";
import "codemirror/mode/pegjs/pegjs";
import "codemirror/mode/perl/perl";
import "codemirror/mode/php/php";
import "codemirror/mode/pig/pig";
import "codemirror/mode/properties/properties";
import "codemirror/mode/pug/pug";
import "codemirror/mode/r/r";
import "codemirror/mode/ruby/ruby";
import "codemirror/mode/rust/rust";
import "codemirror/mode/sass/sass";
import "codemirror/mode/scheme/scheme";
import "codemirror/mode/shell/shell";
import "codemirror/mode/sieve/sieve";
import "codemirror/mode/smalltalk/smalltalk";
import "codemirror/mode/smarty/smarty";
import "codemirror/mode/sparql/sparql";
import "codemirror/mode/sql/sql";
import "codemirror/mode/stex/stex";
import "codemirror/mode/tiddlywiki/tiddlywiki";
import "codemirror/mode/tiki/tiki";
import "codemirror/mode/toml/toml";
import "codemirror/mode/vb/vb";
import "codemirror/mode/vbscript/vbscript";
import "codemirror/mode/velocity/velocity";
import "codemirror/mode/verilog/verilog";
import "codemirror/mode/xml/xml";
import "codemirror/mode/xquery/xquery";
import "codemirror/mode/yaml/yaml";
import "codemirror/mode/yaml-frontmatter/yaml-frontmatter";
import "codemirror/mode/z80/z80";

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
import "./mode/python";
import "./mode/makefile";

// In ReST mode/rst/rst, add Sage support:
//  var rx_examples = new RegExp('^\\s+(?:>>>|sage:|In \\[\\d+\\]:)\\s');
import "./mode/rst";

//  Modify the coffeescript mode to support cjsx.
import "./mode/coffeescript2";
import "./mode/less";
import "./mode/ocaml";
import "./mode/pari";
import "./mode/mediawiki/mediawiki";
import "./mode/lean";
import "./mode/ada";
import "./mode/custom-modes";
