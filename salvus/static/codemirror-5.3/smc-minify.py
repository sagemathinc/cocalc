#!/usr/bin/env python

import os, sys

targets = ['lib/codemirror.js']

for mode in 'clike clojure coffeescript coffeescript2 commonlisp css diff dtd ecl eiffel erlang fortran gfm go groovy haskell haxe htmlembedded htmlmixed http javascript jinja2 julia less lua markdown nginx ntriples ocaml octave pari pascal perl php pig properties python r rst ruby rust sass scheme shell sieve smalltalk smarty sparql sql stex tiddlywiki tiki toml vb vbscript velocity verilog xml xquery yaml z80'.split():
    targets.append("mode/%s/%s.js"%(mode,mode))


for addon in 'mode/multiplex.js mode/overlay.js selection/active-line.js comment/comment.js dialog/dialog.js search/searchcursor.js search/search.js edit/matchbrackets.js edit/closebrackets.js edit/trailingspace.js edit/continuelist.js edit/matchtags.js edit/closetag.js wrap/hardwrap.js runmode/runmode.js  fold/brace-fold.js fold/foldcode.js fold/foldgutter.js fold/markdown-fold.js fold/comment-fold.js fold/indent-fold.js fold/xml-fold.js hint/anyword-hint.js  hint/css-hint.js  hint/html-hint.js  hint/javascript-hint.js  hint/python-hint.js  hint/show-hint.js  hint/sql-hint.js  hint/xml-hint.js'.split():
    targets.append('addon/%s'%addon)

for keymap in 'vim emacs sublime'.split():
    targets.append("keymap/%s.js"%keymap)

for mode in 'mediawiki'.split():
    targets.append("../codemirror-extra/mode/%s/%s.js"%(mode,mode))

if len(sys.argv) == 2:
    version = "-" + sys.argv[1]
else:
    version = ""

cmd = 'uglifyjs2 ' + ' '.join(targets) + ' -m  > codemirror.min%s.js'%version
print cmd
os.system(cmd)
