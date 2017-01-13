#!/usr/bin/env python
# -*- coding: utf8 -*-

# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2017, SageMath, Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#

"""
This script converts a .m GNU Octave file to an SMC sagews file.
It relies on the sagews built-in mode `%octave` to instantiate a communication bridge
to the octave Jupyter kernel.

Authors:

* Hal Snyder <hsnyder@sagemath.com>, started January 2017
* Harald Schilly <hsy@sagemath.com>, started June 2016
"""

from __future__ import print_function
import sys
import os
import codecs
import textwrap

from smc_pyutil.lib import SagewsCell


class M2SageWS(object):

    def __init__(self, filename, overwrite=True):
        """
        Convert a GNU Octave .m file to a SageMathCloud .sagews file.

        INPUT:
        - ``filename`` -- the name of an m file, say foo.m

        OUTPUT:
        - creates a file foo.sagews if it doesn't already exist
        """
        self.infile = filename
        base = os.path.splitext(filename)[0]
        self.outfile = base + '.sagews'
        if not overwrite and os.path.exists(self.outfile):
            raise Exception(
                "%s: Warning --SageMathCloud worksheet '%s' already exists.  Not overwriting.\n" % (sys.argv[0], self.outfile))

        self.m = None  # holds the notebook data
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
        Reads the m file
        """
        with open(self.infile, 'r') as inf:
            self.m = inf.read()

    def write(self, line):
        if line is not None:
            self.output.send(line)

    def open(self):
        sys.stdout.write("%s: Creating SageMathCloud worksheet '%s'\n" %
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
        self.output.next()

    def kernel(self):
        """
        The first cell contains a small info text and sets the global octave mode.
        """
        cell = '''\
        %auto
        # This cell automatically evaluates on startup -- or run it manually if it didn't evaluate.
        # Here, it starts the Jupyter octave kernel and sets it as the default mode for this worksheet.
        %default_mode octave'''
        self.write(SagewsCell(input=textwrap.dedent(cell)).convert())

    def body(self):
        """
        Convert input to body of the sagews document.
        """
        fhead = "# {}\n".format(self.infile)
        self.write(SagewsCell(input=fhead+self.m).convert())


def main():
    if len(sys.argv) == 1:
        sys.stderr.write("""
Convert a GNU Octave .m file to a SageMathCloud .sagews file.

    Usage: %s path/to/filename.m [path/to/filename2.m ...]

Creates corresponding file path/to/filename.sagews, if it doesn't exist. Sets
default_mode to %octave. Places the .m file in a single sagews cell with
file name in a comment at the start.
""" % sys.argv[0])
        sys.exit(1)

    for path in sys.argv[1:]:
        M2SageWS(path).convert()

if __name__ == "__main__":
    main()
