#!/usr/bin/python

# rmd2html.py - used by rmd edit mode

import os, sys, subprocess, errno

def rmd2html(path):
    if not os.path.exists(path):
        raise IOError(errno.ENOENT, os.strerror(errno.ENOENT), path)

    (root, ext) = os.path.splitext(path)
    if ext.lower() != ".rmd":
        raise ValueError('Rmd input file required, got {}'.format(path))

    (head,tail) = os.path.split(path)
    if head == '':
        head = "./"
    cmd = '''Rscript -e "library(knitr); setwd('{}'); knit('{}')" >/dev/null 2>/dev/null'''.format(head, tail)
    if subprocess.call(cmd, shell=True) == 0:
        cmd2 = "pandoc -s {}.md -o {}.html 2>/dev/null".format(root, root)
        if subprocess.call(cmd2, shell=True) == 0:
            with open("{}.html".format(root), 'r') as htmlfile:
                print(htmlfile.read())

def main():
    if len(sys.argv) != 2:
        raise ValueError('Usage: {} path/to/file.Rmd'.format(sys.argv[0]))

    rmd2html(sys.argv[1])

if __name__ == "__main__":
    main()



