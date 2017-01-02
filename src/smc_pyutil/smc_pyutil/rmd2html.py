#!/usr/bin/python

# rmd2html.py - used by rmd edit mode

import os, sys, subprocess, errno

def rmd2html(path):
    if not os.path.exists(path):
        raise IOError(errno.ENOENT, os.strerror(errno.ENOENT), path)

    absp = os.path.abspath(path)
    (head,tail) = os.path.split(absp)
    os.chdir(head)

    (root, ext) = os.path.splitext(tail)
    if ext.lower() != ".rmd":
        raise ValueError('Rmd input file required, got {}'.format(path))

    cmd = '''Rscript -e "library(knitr); knit('{}')" >/dev/null'''.format(tail)
    if subprocess.call(cmd, shell=True) == 0:
        cmd2 = "pandoc -s {}.md -t html".format(root)
        subprocess.call(cmd2, shell=True)

def main():
    if len(sys.argv) != 2:
        raise ValueError('Usage: {} path/to/file.Rmd'.format(sys.argv[0]))

    rmd2html(sys.argv[1])

if __name__ == "__main__":
    main()



