#!/usr/bin/python

# Maximum number of files that user can open at once using the open command.
# This is here to avoid the user opening 100 files at once (say)
# via "open *" and killing their frontend.
MAX_FILES = 15

import json, os, sys

home = os.environ['HOME']

if 'TMUX' in os.environ:
    prefix = '\x1bPtmux;\x1b'
    postfix = '\x1b\\'
else:
    prefix = ''
    postfix = ''

def process(paths):
    v = []
    if len(paths) > MAX_FILES:
        sys.stderr.write("You may open at most %s at once using the open command; truncating list\n"%MAX_FILES)
        paths = paths[:MAX_FILES]
    for path in paths:
        if not path:
            continue
        if not os.path.exists(path) and any(c in path for c in '{?*'):
            # If the path doesn't exist and does contain a shell glob character which didn't get expanded,
            # then don't try to just create that file.  See https://github.com/sagemathinc/smc/issues/1019
            sys.stderr.write("no match for '%s', so not creating\n"%path)
            continue
        if not os.path.exists(path):
            if '/' in path:
                dir = os.path.dirname(path)
                if not os.path.exists(dir):
                    sys.stderr.write("creating directory '%s'\n"%dir)
                    os.makedirs(dir)
            if path[-1] != '/':
                sys.stderr.write("creating file '%s'\n"%path)
                import new_file
                new_file.new_file(path)   # see https://github.com/sagemathinc/smc/issues/1476

        path = os.path.abspath(path)

        # determine name relative to home directory
        if path.startswith(home):
            name = path[len(home)+1:]
        else:
            name = path

        # Is it a file or directory?
        if os.path.isdir(path):
            v.append({'directory':name})
        else:
            v.append({'file':name})

    if len(v) > 0:
        mesg = {'event':'open', 'paths':v}
        print prefix + '\x1b]49;%s\x07'%json.dumps(mesg,separators=(',',':')) + postfix

def main():
    if len(sys.argv) == 1:
        print "Usage: open [path names] ..."
        print "Opens each file (or directory) in the Sagemath Cloud web-based editor from the shell."
        print "If the named file doesn't exist, it is created."
    else:
        process(sys.argv[1:])

if __name__ == "__main__":
    main()
