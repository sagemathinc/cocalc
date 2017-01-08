#!/usr/bin/python

# java2html.py - used by java edit mode

import os, sys, subprocess, errno, re

def java2html(path):
    if not os.path.exists(path):
        raise IOError(errno.ENOENT, os.strerror(errno.ENOENT), path)

    (root, ext) = os.path.splitext(path)
    if ext.lower() != ".java":
        raise ValueError('Java input file required, got {}'.format(path))

    with open(path, 'r') as f:
        s = f.read()
    try:
        (path, file)  = os.path.split(path)
        (child_stdin, child_stdout, child_stderr) = os.popen3('cd "%s"; javac "%s"; java "%s"' % (path, file, file[:-5]))
        output = child_stderr.read()
        output += '\n' + child_stdout.read()
        sys.stdout.flush()
        sys.stderr.flush()
        print(output.replace('\n', '<br/>'))
    finally:
        pass

def main():
    if len(sys.argv) != 2:
        raise ValueError('Usage: {} path/to/file.java'.format(sys.argv[0]))

    java2html(sys.argv[1])

if __name__ == "__main__":
    main()



