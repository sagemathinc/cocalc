# Loading and configuring the codemirror editor

window.CodeMirror = CodeMirror = require('codemirror')


require('codemirror/addon/mode/multiplex.js')
require('codemirror/addon/mode/overlay.js')
require('codemirror/addon/selection/active-line.js')
require('codemirror/addon/comment/comment.js')

require('codemirror/addon/dialog/dialog.js')
require('codemirror/addon/dialog/dialog.css')

require('codemirror/addon/search/searchcursor.js')

require('codemirror/addon/edit/matchbrackets.js')
require('codemirror/addon/edit/closebrackets.js')
require('codemirror/addon/edit/trailingspace.js')
require('codemirror/addon/edit/continuelist.js')
require('codemirror/addon/edit/matchtags.js')
require('codemirror/addon/edit/closetag.js')
require('codemirror/addon/wrap/hardwrap.js')
require('codemirror/addon/runmode/runmode.js')
require('codemirror/addon/fold/brace-fold.js')
require('codemirror/addon/fold/foldcode.js')
require('codemirror/addon/fold/foldgutter.js')
require('codemirror/addon/fold/foldgutter.css')

require('codemirror/addon/fold/markdown-fold.js')
require('codemirror/addon/fold/comment-fold.js')
require('codemirror/addon/fold/indent-fold.js')
require('codemirror/addon/fold/xml-fold.js')
require('codemirror/addon/hint/anyword-hint.js')
require('codemirror/addon/hint/css-hint.js')
require('codemirror/addon/hint/html-hint.js')
require('codemirror/addon/hint/javascript-hint.js')

require('codemirror/addon/hint/show-hint.js')
require('codemirror/addon/hint/show-hint.css')

require('codemirror/addon/hint/sql-hint.js')
require('codemirror/addon/hint/xml-hint.js')

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
require('codemirror/mode/lua/lua.js')
require('codemirror/mode/makefile.js')
require('codemirror/mode/markdown/markdown.js')
require('codemirror/mode/nginx/nginx.js')
require('codemirror/mode/ntriples/ntriples.js')
require('codemirror/mode/octave/octave.js')
require('codemirror/mode/pascal/pascal.js')
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

# Keyboard bindings
require('codemirror/keymap/vim.js')
require('codemirror/keymap/emacs.js')
require('codemirror/keymap/sublime.js')

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
# For some reason python-hint.js got removed from codemirror itself
require('./addon/hint/python-hint.js')

require('./addon/smc-search.js')



# In ReST mode/rst/rst.js, add Sage support:
#  var rx_examples = new RegExp('^\\s+(?:>>>|sage:|In \\[\\d+\\]:)\\s');
require('./mode/rst.js')

# Modify the coffeescript mode to support cjsx.
require('./mode/coffeescript2.js')

require('./mode/less.js')
require('./mode/ocaml.js')
require('./mode/pari.js')

require('./mode/mediawiki/mediawiki.js')
require('./mode/mediawiki/mediawiki.css')




# CSS

require('codemirror/lib/codemirror.css')
require('codemirror/theme/solarized.css')
require('codemirror/theme/twilight.css')
require('codemirror/theme/vibrant-ink.css')
require('codemirror/theme/night.css')
require('codemirror/theme/cobalt.css')
require('codemirror/theme/neat.css')
require('codemirror/theme/erlang-dark.css')
require('codemirror/theme/lesser-dark.css')
require('codemirror/theme/elegant.css')
require('codemirror/theme/monokai.css')
require('codemirror/theme/ambiance-mobile.css')
require('codemirror/theme/ambiance.css')
require('codemirror/theme/rubyblue.css')
require('codemirror/theme/blackboard.css')
require('codemirror/theme/xq-dark.css')
require('codemirror/theme/eclipse.css')
require('codemirror/theme/3024-day.css')
require('codemirror/theme/3024-night.css')
require('codemirror/theme/base16-light.css')
require('codemirror/theme/base16-dark.css')
require('codemirror/theme/the-matrix.css')
require('codemirror/theme/paraiso-dark.css')
require('codemirror/theme/paraiso-light.css')
require('codemirror/theme/tomorrow-night-eighties.css')
