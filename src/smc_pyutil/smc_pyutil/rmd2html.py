#!/usr/bin/python

# rmd2html.py - used by rmd edit mode

import os, sys, subprocess, errno
from subprocess import PIPE

def rmd2html(path):
    if not os.path.exists(path):
        raise IOError(errno.ENOENT, os.strerror(errno.ENOENT), path)

    absp = os.path.abspath(path)
    (head,tail) = os.path.split(absp)
    os.chdir(head)

    (root, ext) = os.path.splitext(tail)
    if ext.lower() != ".rmd":
        raise ValueError('Rmd input file required, got {}'.format(path))

    # knitr always writes something to stderr
    # only pass that to outer program if there is an error
    cmd = '''Rscript -e "library(knitr); knit('{}')" >/dev/null'''.format(tail)
    p0 = subprocess.Popen(cmd, shell=True, stderr=PIPE)
    (stdoutdata, stderrdata) = p0.communicate()
    if p0.returncode == 0:
        cmd2 = "pandoc -s {}.md -t html".format(root)
        subprocess.call(cmd2, shell=True)
    else:
        sys.stderr.write(stderrdata)
        sys.stderr.flush()

def main():
    if len(sys.argv) != 2:
        raise ValueError('Usage: {} path/to/file.Rmd'.format(sys.argv[0]))

    rmd2html(sys.argv[1])

if __name__ == "__main__":
    main()



