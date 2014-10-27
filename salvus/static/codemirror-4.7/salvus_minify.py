#!/usr/bin/env python

import os

targets = ['lib/codemirror.js']

for mode in 'clike clojure coffeescript commonlisp css diff dtd ecl eiffel erlang fortran gfm go groovy haskell haxe htmlembedded htmlmixed http javascript jinja2 julia less lua markdown nginx ntriples ocaml octave pari pascal perl php pig properties python r rst ruby rust scheme shell sieve smalltalk smarty sparql sql stex tiddlywiki tiki toml vb vbscript velocity verilog xml xquery yaml z80'.split():
    targets.append("mode/%s/%s.js"%(mode,mode))


for addon in 'mode/multiplex.js mode/overlay.js selection/active-line.js comment/comment.js dialog/dialog.js search/searchcursor.js search/search.js edit/matchbrackets.js edit/closebrackets.js edit/trailingspace.js edit/continuelist.js edit/matchtags.js edit/closetag.js wrap/hardwrap.js runmode/runmode.js fold/xml-fold.js'.split():
    targets.append('addon/%s'%addon)

for keymap in 'vim emacs sublime'.split():
    targets.append("keymap/%s.js"%keymap)


cmd = 'uglifyjs2 ' + ' '.join(targets) + ' -m  > codemirror.min.js'
print cmd
os.system(cmd)
