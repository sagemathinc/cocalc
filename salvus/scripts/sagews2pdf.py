#!/usr/bin/env python

MARKERS = {'cell':u"\uFE20", 'output':u"\uFE21"}

import cPickle, json, os, sys

def sagews_to_pdf(filename):
    base = os.path.splitext(filename)[0]
    pdf  = base + ".pdf"
    print "converting: %s --> %s"%(filename, pdf)

class Cell(object):
    def __init__(self, s):
        self.raw = s
        v = s.split('\n' + MARKERS['output'])
        if len(v) > 0:
            w = v[0].split(MARKERS['cell']+'\n')
            self.input_uuid = w[0].lstrip(MARKERS['cell'])
            self.input = w[1]
        if len(v) > 1:
            w = v[1].split(MARKERS['output'])
            self.output_uuid = w[0] if len(w) > 0 else ''
            self.output = [json.loads(x) for x in w[1:] if x]

class Worksheet(object):
    def __init__(self, filename=None, s=None):
        """
        The worksheet defined by the given filename or UTF unicode string s.
        """
        if filename is not None:
            self._init_from(open(filename).read().decode('utf8'))
        elif s is not None:
            self._init_from(s)
        else:
            raise ValueError("filename or s must be defined")

    def _init_from(self, s):

        self._cells = [Cell(x) for x in s.split('\n'+MARKERS['cell'])]

    def __getitem__(self, i):
        return self._cells[i]

    def __len__(self):
        return len(self._cells)





def parse_sagews(s):
    """
    Given a sagews file as a string s, return a list of cell objects.
    """




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
