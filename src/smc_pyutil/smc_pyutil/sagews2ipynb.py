#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

from __future__ import absolute_import, print_function

import argparse, codecs, json, os
from . import sagews2pdf


def ipynb_string_list(s):
    v = s.split('\n')
    for i in range(len(v) - 1):
        v[i] += '\n'
    return v


class Worksheet(sagews2pdf.Worksheet):
    def ipynb(self):
        obj = {
            "metadata": {
                "kernelspec": {
                    "display_name": "SageMath",
                    "language": "python",
                    "name": "sagemath"
                },
                "language_info": {
                    "codemirror_mode": {
                        "name": "ipython",
                        "version": 2
                    },
                    "file_extension": ".py",
                    "mimetype": "text/x-python",
                    "name": "python",
                    "nbconvert_exporter": "python",
                    "pygments_lexer": "ipython2",
                    "version": "2.7.12+"
                }
            },
            "nbformat": 4,
            "nbformat_minor": 4
        }
        obj['cells'] = self.ipynb_cells()
        return obj

    def ipynb_cells(self):
        return [self.ipynb_cell(cell) for cell in self._cells]

    def ipynb_cell(self, cell):
        x = {"metadata": {"collapsed": False}}
        source = cell.input.strip()
        if source.startswith('%md'):
            x['cell_type'] = 'markdown'
            source = '\n'.join(source.split('\n')[1:])
        else:
            x['cell_type'] = 'code'
        x['source'] = ipynb_string_list(source)
        return x


def sagews_to_pdf(filename):
    base = os.path.splitext(filename)[0]
    ipynb = base + ".ipynb"
    print("converting: %s --> %s" % (filename, ipynb))
    W = Worksheet(filename)
    codecs.open(ipynb, 'w', 'utf8').write(json.dumps(W.ipynb(), indent=1))
    print("Created", ipynb)


def main():
    parser = argparse.ArgumentParser(
        description="convert a sagews worksheet to a Jupyter Notebook")
    parser.add_argument("filename",
                        nargs='+',
                        help="name of sagews files (required)",
                        type=str)
    args = parser.parse_args()

    for filename in args.filename:
        sagews_to_pdf(filename)


if __name__ == "__main__":
    main()
