#!/usr/bin/env python
# -*- coding: utf8 -*-

# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
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

# This script converts an .ipynb jupyter notebook file to an SMC sagews file
# Harald Schilly <hsy@sagemath.com>, started June 2016
from __future__ import print_function
import sys
import os
import codecs
import textwrap
import json
# reading the ipynb via http://nbformat.readthedocs.io/en/latest/api.html
import nbformat

from sws2sagews import MARKERS, uuid


class Ipynb2SageWS(object):

    def __init__(self, filename, overwrite=True):
        """
        Convert a Jupyter Notebook .ipynb file to a SageMathCloud .sagews file.

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
                "%s: Warning --SageMathCloud worksheet '%s' already exists.  Not overwriting.\n" % (sys.argv[0], self.outfile))

        self.nb = None  # holds the notebook data
        self.output = None  # send cells to write here

    def cell(self, html='', input='', output='', md=''):
        cell = None
        html = html.strip()
        input = input.strip()
        output = output.strip()
        md = md.strip()

        def mkcell(input='', output='', type='stdout', modes='i'):
            cell = MARKERS['cell'] + uuid() + modes + MARKERS['cell'] + u'\n'
            if type in ['md', 'html']:
                cell += '%%%s\n' % type
                output = input
            cell += input
            cell += (u'\n' + MARKERS['output'] + uuid() + MARKERS['output'] +
                     json.dumps({type: output, 'done': True}) + MARKERS['output']) + u'\n'
            return cell

        if html:
            cell = mkcell(html, type='html')
        elif md:
            cell = mkcell(md, type='md')

        if cell is None and (input or output):
            modes = ''
            if '%auto' in input:
                modes += 'a'
            if '%hide' in input:
                modes += 'i'
            if '%hideall' in input:
                modes += 'o'
            cell = mkcell(input, output, modes=modes)

        if cell is not None:
            self.output.send(cell)

    def convert(self):
        self.read()
        self.open()
        self.kernel()
        self.body()

    def read(self):
        self.nb = nbformat.read(self.infile, 4)

    def open(self):
        sys.stdout.write("%s: Creating SageMathCloud worksheet '%s'\n" %
                         (sys.argv[0], self.outfile))
        sys.stdout.flush()

        def output():
            with codecs.open(self.outfile, 'w', 'utf8') as fout:
                while True:
                    cell = yield
                    if cell is None:
                        return
                    fout.write(cell)
        self.output = output()
        self.output.next()

    def kernel(self):
        spec = self.nb['metadata']
        name = spec['kernelspec']['name']
        cell = '''\
        # This cell auto-evaluates and starts the Jupyter kernel with the specified name.
        %auto
        jupyter_kernel = jupyter("{}")
        %default_mode jupyter_kernel'''.format(name)
        self.cell(input=textwrap.dedent(cell))

    def body(self):
        # see http://nbformat.readthedocs.io/en/latest/format_description.html

        def process_output(outputs):
            stdout = []
            html = []
            for output in outputs:
                ot = output['output_type']
                if ot == 'stream':
                    stdout.append(output['text'])
                elif ot in ['display_data', 'execute_result']:
                    data = output['data']
                    if 'text/html' in data:
                        html.append(data['text/html'])
                    if 'text/latex' in data:
                        html.append(data['text/latex'])
                    if 'text/plain' in data:
                        stdout.append(data['text/plain'])
                    #print(json.dumps(data, indent=2))
                else:
                    print("ERROR: unknown output type '%s':\n%s" %
                          (ot, json.dumps(output, indent=2)))

            return u'\n'.join(stdout), u'<br/>'.join(html)

        for cell in self.nb.cells:
            ct = cell['cell_type']
            source = cell.get('source', None)
            outputs = cell.get('outputs', [])

            if ct == 'markdown':
                self.cell(md=source)

            elif ct == 'code':
                text, html = process_output(outputs)
                self.cell(input=source, html=html, output=text)

            else:
                print("ERROR: cell type '%s' not recognized:\n%s" %
                      (ct, json.dumps(cell, indent=2)))


def main():
    if len(sys.argv) == 1:
        sys.stderr.write("""
Convert a Jupyter Notebook .ipynb file to a SageMathCloud .sagews file.

    Usage: %s path/to/filename.sws [path/to/filename2.sws] ...

Creates corresponding file path/to/filename.sagews, if it doesn't exist.
""" % sys.argv[0])
        sys.exit(1)

    for path in sys.argv[1:]:
        Ipynb2SageWS(path).convert()

if __name__ == "__main__":
    main()
