###
Load javascript support for all modes that we support in CoCalc.

NOTE: This is used by the share server, so we can't load css or other stuff
that shouldn't also be used on the backend.
###

require('codemirror/mode/clike/clike.js')
require('codemirror/mode/clojure/clojure.js')
require('codemirror/mode/coffeescript/coffeescript.js')
require('codemirror/mode/commonlisp/commonlisp.js')
require('codemirror/mode/css/css.js')
require('codemirror/mode/diff/diff.js')
require('codemirror/mode/dockerfile/dockerfile.js')
require('codemirror/mode/dtd/dtd.js')
require('codemirror/mode/ecl/ecl.js')
require('codemirror/mode/eiffel/eiffel.js')
require('codemirror/mode/elm/elm.js')
require('codemirror/mode/erlang/erlang.js')
require('codemirror/mode/fortran/fortran.js')
require('codemirror/mode/gfm/gfm.js')
require('codemirror/mode/go/go.js')
require('codemirror/mode/groovy/groovy.js')
require('codemirror/mode/haskell/haskell.js')
require('codemirror/mode/haxe/haxe.js')
require('codemirror/mode/htmlembedded/htmlembedded.js')
require('codemirror/mode/htmlmixed/htmlmixed.js')
require('codemirror/mode/http/http.js')
require('codemirror/mode/javascript/javascript.js')
require('codemirror/mode/jinja2/jinja2.js')
require('codemirror/mode/jsx/jsx.js')
require('codemirror/mode/julia/julia.js')
require('codemirror/mode/livescript/livescript.js')
require('codemirror/mode/lua/lua.js')
require('codemirror/mode/markdown/markdown.js')
require('codemirror/mode/nginx/nginx.js')
require('codemirror/mode/ntriples/ntriples.js')
require('codemirror/mode/octave/octave.js')
require('codemirror/mode/pascal/pascal.js')
require('codemirror/mode/pegjs/pegjs.js')
require('codemirror/mode/perl/perl.js')
require('codemirror/mode/php/php.js')
require('codemirror/mode/pig/pig.js')
require('codemirror/mode/properties/properties.js')
require('codemirror/mode/pug/pug.js')
require('codemirror/mode/r/r.js')
require('codemirror/mode/ruby/ruby.js')
require('codemirror/mode/rust/rust.js')
require('codemirror/mode/sass/sass.js')
require('codemirror/mode/scheme/scheme.js')
require('codemirror/mode/shell/shell.js')
require('codemirror/mode/sieve/sieve.js')
require('codemirror/mode/smalltalk/smalltalk.js')
require('codemirror/mode/smarty/smarty.js')
require('codemirror/mode/sparql/sparql.js')
require('codemirror/mode/sql/sql.js')
require('codemirror/mode/stex/stex.js')
require('codemirror/mode/tiddlywiki/tiddlywiki.js')
require('codemirror/mode/tiki/tiki.js')
require('codemirror/mode/toml/toml.js')
require('codemirror/mode/vb/vb.js')
require('codemirror/mode/vbscript/vbscript.js')
require('codemirror/mode/velocity/velocity.js')
require('codemirror/mode/verilog/verilog.js')
require('codemirror/mode/xml/xml.js')
require('codemirror/mode/xquery/xquery.js')
require('codemirror/mode/yaml/yaml.js')
require('codemirror/mode/z80/z80.js')

###
* In mode/python/python.js I add our unicode output character to be a comment starter:

      // Handle Comments
      if (ch == "#"  || ch == "\uFE21") {

Also, it's critical to fix a bug by replacing the state function by

  function top(state) {
    if (state.scopes.length == 0) {
        return {type:"undefined", offset:0};  // better than totally crashing
    }
    return state.scopes[state.scopes.length - 1];
  }
###
require('./mode/python.js')

require('./mode/makefile.js')

# In ReST mode/rst/rst.js, add Sage support:
#  var rx_examples = new RegExp('^\\s+(?:>>>|sage:|In \\[\\d+\\]:)\\s');
require('./mode/rst.js')

# Modify the coffeescript mode to support cjsx.
require('./mode/coffeescript2.js')

require('./mode/less.js')
require('./mode/ocaml.js')
require('./mode/pari.js')

require('./mode/mediawiki/mediawiki.js')

require('./mode/lean')
