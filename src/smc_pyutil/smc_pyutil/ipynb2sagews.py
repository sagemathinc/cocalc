#!/usr/bin/env python
# -*- coding: utf-8 -*-
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details
"""
This script converts an .ipynb jupyter notebook file to an SMC sagews file.
It relies on the sagews command `jupyter()` to instantiate the communication bridge
to the Jupyter kernel.

Authors:

* Harald Schilly <hsy@sagemath.com>, started June 2016
"""

from __future__ import print_function
from __future__ import absolute_import
import sys
import os
import codecs
import textwrap
import json
# reading the ipynb via http://nbformat.readthedocs.io/en/latest/api.html
import nbformat

from smc_pyutil.lib import SagewsCell


class Ipynb2SageWS(object):
    def __init__(self, filename, overwrite=True):
        """
        Convert a Jupyter Notebook .ipynb file to a CoCalc .sagews file.

        INPUT:
        - ``filename`` -- the name of an ipynb file, say foo.ipynb

        OUTPUT:
        - creates a file foo.sagews if it doesn't already exist
        """
        self.infile = filename
        base = os.path.splitext(filename)[0]
        self.outfile = base + '.sagews'
        if not overwrite and os.path.exists(self.outfile):
            raise Exception(
                "%s: Warning --CoCalc worksheet '%s' already exists.  Not overwriting.\n"
                % (sys.argv[0], self.outfile))

        self.nb = None  # holds the notebook data
        self.output = None  # use self.write([line]) to write to output

    def convert(self):
        """
        Main routine
        """
        self.read()
        self.open()
        self.kernel()
        self.body()

    def read(self):
        """
        Reads the ipynb file, regardless of version, and converts to API version 4
        """
        self.nb = nbformat.read(self.infile, 4)

    def write(self, line):
        if line is not None:
            self.output.send(line)

    def open(self):
        sys.stdout.write("%s: Creating CoCalc worksheet '%s'\n" %
                         (sys.argv[0], self.outfile))
        sys.stdout.flush()

        def output():
            with codecs.open(self.outfile, 'w', 'utf8') as fout:
                while True:
                    cell = yield
                    if cell is None:
                        break
                    fout.write(cell)

        self.output = output()
        next(self.output)

    def kernel(self):
        """
        The first cell contains a small info text and defines the global jupyter mode,
        based on the kernel name in the ipynb file!
        """
        spec = self.nb['metadata']
        name = spec['kernelspec']['name']
        if name.startswith('sage'):
            cell = '''\
            # This worksheet was converted from a notebook running Jupyter kernel
            # version {}.'''.format(name)
        else:
            cell = '''\
            %auto
            # This cell automatically evaluates on startup -- or run it manually if it didn't evaluate.
            # Here, it initializes the Jupyter kernel with the specified name and sets it as the default mode for this worksheet.
            jupyter_kernel = jupyter("{}")  # run "jupyter?" for more information.
            %default_mode jupyter_kernel'''.format(name)
        self.write(SagewsCell(input=textwrap.dedent(cell)).convert())

    def body(self):
        """
        Converting all cells of the ipynb as the body of the sagews document.

        see http://nbformat.readthedocs.io/en/latest/format_description.html
        """

        for cell in self.nb.cells:
            ct = cell['cell_type']
            source = cell.get('source', None)
            outputs = cell.get('outputs', [])

            if ct == 'markdown':
                self.write(SagewsCell(md=source).convert())

            elif ct == 'code':
                self.write(SagewsCell(input=source, outputs=outputs).convert())

            elif ct == 'raw':
                self.write(SagewsCell(input=source).convert())

            else:
                print("ERROR: cell type '%s' not recognized:\n%s" %
                      (ct, json.dumps(cell, indent=2)))


def main():
    if len(sys.argv) == 1:
        sys.stderr.write("""
Convert a Jupyter Notebook .ipynb file to a CoCalc .sagews file.

    Usage: %s path/to/filename.ipynb [path/to/filename2.ipynb ...]

Creates corresponding file path/to/filename.sagews, if it doesn't exist.
""" % sys.argv[0])
        sys.exit(1)

    for path in sys.argv[1:]:
        Ipynb2SageWS(path).convert()


if __name__ == "__main__":
    main()
