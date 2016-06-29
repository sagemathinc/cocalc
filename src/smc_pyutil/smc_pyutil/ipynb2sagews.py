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
from ansi2html import Ansi2HTMLConverter

from sws2sagews import MARKERS, uuid


class IpynbCell(object):

    '''
    Sagews vs. Ipynb cells have several corner cases which make a translation a bit complex.
    This class is only used for creating a suitable ipynb cell representation,
    that is then inserted into the sagews worksheet.

    # see http://nbformat.readthedocs.io/en/latest/format_description.html
    '''

    def __init__(self, input='', outputs=None, md=None):
        '''
        Either specify `md` as markdown text, which is used for the text boxes in ipynb,
        or specify `outputs` as the list of output data dictionaries from ipynb (format version 4)
        '''
        if outputs is not None and md is not None:
            raise ArgumentError('Either specify md or outputs -- not both!')
        self._ansi2htmlconv = Ansi2HTMLConverter(inline=True, linkify=True)
        # raw data
        self.input = input or ''
        # cell states data
        self.md = md or ''
        self.html = ''
        self.output = ''
        self.ascii = ''
        self.error = ''
        self.stdout = ''
        # process outputs list
        if outputs is not None:
            self.process_outputs(outputs)

    def ansi2htmlconv(self, ansi):
        '''
        Sometimes, ipynb contains ansi strings with control characters for colors.
        This little helper converts this to fixed-width formatted html with coloring.
        '''
        # `full = False` or else cell output is huge
        html = self._ansi2htmlconv.convert(ansi, full=False)
        return '<pre><span style="font-family:monospace;">%s</span></pre>' % html

    def process_outputs(self, outputs):
        stdout = []
        html = []
        # ascii: for actual html content, that has been converted from ansi-encoded ascii
        ascii = []
        # errors are similar to ascii content
        errors = []

        for output in outputs:
            ot = output['output_type']
            if ot == 'stream':
                ascii.append(self.ansi2htmlconv(output['text']))

            elif ot in ['display_data', 'execute_result']:
                data = output['data']
                if 'text/html' in data:
                    html.append(data['text/html'])
                if 'text/latex' in data:
                    html.append(data['text/latex'])
                if 'text/plain' in data:
                    stdout.append(data['text/plain'])
                # print(json.dumps(data, indent=2))

            elif ot in 'error':
                if 'traceback' in output:
                    # print(json.dumps(output['traceback'], indent=2))
                    for tr in output['traceback']:
                        errors.append(self.ansi2htmlconv(tr))

            else:
                print("ERROR: unknown output type '%s':\n%s" %
                      (ot, json.dumps(output, indent=2)))

        # TODO refactor this mess using IpynbCell, etc.
        self.stdout = u'\n'.join(stdout)
        self.html = u'<br/>'.join(html)
        self.error = u'<br/>'.join(errors)
        self.ascii = u'<br/>'.join(ascii)

    def convert(self):
        cell = None
        html = self.html.strip()
        input = self.input.strip()
        stdout = self.stdout.strip()
        ascii = self.ascii.strip()
        error = self.error.strip()
        md = self.md.strip()

        def mkcell(input='', output='', type='stdout', modes=''):
            '''
            This creates a sagews cell.

            - modes:
               * '%auto' → 'a'
               * '%hide' → 'i'
               * '%hideall' → 'o'
            - type:
               * err/ascii: html formatted error or ascii/ansi content
               * stdout: plain text
               * html/md: explicit input of html code or md, as display_data
            '''
            cell = MARKERS['cell'] + uuid() + modes + MARKERS['cell'] + u'\n'
            if type == 'md':
                cell += '%%%s\n' % type
                output = input
            cell += input
            # input is done, now the output part
            if type in ['err', 'ascii']:
                # mangle type of output to html
                type = 'html'
            cell += (u'\n' + MARKERS['output'] + uuid() + MARKERS['output'] +
                     json.dumps({type: output, 'done': True}) + MARKERS['output']) + u'\n'
            return cell

        if html:
            cell = mkcell(input=input, output = html, type='html', modes='')
        elif md:
            cell = mkcell(input=md, type = 'md', modes='i')
        elif error:
            cell = mkcell(input=input, output=error, type='err')
        elif ascii:
            cell = mkcell(input=input, output=ascii, type='ascii')

        if cell is None and (input or stdout):
            cell = mkcell(input, stdout)

        return cell


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

    def convert(self):
        self.read()
        self.open()
        self.kernel()
        self.body()

    def read(self):
        self.nb = nbformat.read(self.infile, 4)

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
        spec = self.nb['metadata']
        name = spec['kernelspec']['name']
        cell = '''\
        # This cell auto-evaluates and starts the Jupyter kernel with the specified name.
        %auto
        jupyter_kernel = jupyter("{}")
        %default_mode jupyter_kernel'''.format(name)
        self.write(IpynbCell(input=textwrap.dedent(cell)).convert())

    def body(self):
        # see http://nbformat.readthedocs.io/en/latest/format_description.html

        for cell in self.nb.cells:
            ct = cell['cell_type']
            source = cell.get('source', None)
            outputs = cell.get('outputs', [])

            if ct == 'markdown':
                self.write(IpynbCell(md=source).convert())

            elif ct == 'code':
                self.write(IpynbCell(input=source, outputs=outputs).convert())

            elif ct == 'raw':
                self.write(IpynbCell(input=source).convert())

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
