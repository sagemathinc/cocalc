#!/usr/bin/env python

MARKERS = {'cell':u"\uFE20", 'output':u"\uFE21"}

import cPickle, json, os, sys

def sagews_to_pdf(filename):
    base = os.path.splitext(filename)[0]
    pdf  = base + ".pdf"
    print "converting: %s --> %s"%(filename, pdf)


if __name__ == "__main__":
    if len(sys.argv) == 1:
        sys.stderr.write("""
Convert a Sagemath Cloud sagews file to a pdf file.

    Usage: %s [path/to/filename.sagews] [path/to/filename2.sagews] ...

Creates corresponding file path/to/filename.sagews, if it doesn't exist.
Also, a data/ directory may be created in the current directory, which contains
the contents of the data path in filename.sws.
"""%sys.argv[0])
        sys.exit(1)

    for path in sys.argv[1:]:
        sagews_to_pdf(path)
