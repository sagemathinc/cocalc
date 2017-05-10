#!/usr/bin/env python
# -*- coding: utf-8 -*-


"""
Copyright (c) 2017,  SageMath, Inc..

All rights reserved.
"""

import argparse, codecs, os


import sagews2pdf

class Worksheet(sagews2pdf.Worksheet):
    def ipynb(self):
        return '{}'

def sagews_to_pdf(filename):
    base = os.path.splitext(filename)[0]
    ipynb = base + ".ipynb"
    print("converting: %s --> %s"%(filename, ipynb))
    W = Worksheet(filename)
    codecs.open(ipynb, 'w', 'utf8').write(W.ipynb())
    print("Created", ipynb)

def main():
    parser = argparse.ArgumentParser(description="convert a sagews worksheet to a Jupyter Notebook")
    parser.add_argument("filename", nargs='+', help="name of sagews files (required)", type=str)
    args = parser.parse_args()
    
    for filename in args.filename:
        sagews_to_pdf(filename)

if __name__ == "__main__":
    main()