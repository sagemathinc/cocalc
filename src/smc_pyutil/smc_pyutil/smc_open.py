#!/usr/bin/python

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
    for path in paths:
        if not path:
            continue
        if not os.path.exists(path):
            if '/' in path:
                dir = os.path.dirname(path)
                if not os.path.exists(dir):
                    sys.stderr.write("creating directory '%s'\n"%dir)
                    os.makedirs(dir)
            if path[-1] != '/':
                sys.stderr.write("creating file '%s'\n"%path)
                open(path,'w').close()

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
        # exception if any args have ? or * after glob expansion
        ff = filter(lambda x: any(wc in x for wc in ['?', '*']), sys.argv[1:])
        if len(ff) > 0:
            raise ValueError('No matching files for wildcard argument(s)', ff)
        process(sys.argv[1:])

if __name__ == "__main__":
    main()
