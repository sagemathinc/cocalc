#!/usr/bin/env python
# this script converts an html-exported sagews file back to sagews

from __future__ import print_function, unicode_literals

import sys
import os
import urllib
import base64

def extract(in_fn, out_fn):
    print("extracting from '{in_fn}' to '{out_fn}'".format(**locals()))
    start = 'href="data:application/octet-stream'
    def get_href():
        for line in open(in_fn, 'r'):
            if '<a' in line and start in line and 'download=' in line:
                i = line.find(start)
                href = line[i:].split('"', 2)[1]
                return href

    href = get_href()
    if href is None:
        raise Exception("embedded sagews file not found!")
    base64str = href.split(',', 1)
    if len(base64str) <= 1:
        raise Exception("unable to parse href data")
    data = base64.b64decode(urllib.unquote(base64str[1]))
    open(out_fn, 'w').write(data)

def main():
    if len(sys.argv) <= 1:
        raise Exception("first argument needs to be the converted HTML file (likely '*.sagews.html')")
    in_fn = sys.argv[1]
    if len(sys.argv) == 2:
        # detecting a 'filename.sagews.html' pattern
        in_split = in_fn.rsplit('.', 2)
        if len(in_split) >= 3 and in_split[-2] == 'sagews':
            out_fn = '.'.join(in_split[:-1])
        else:
            out_fn = in_fn + '.sagews'
    else:
        out_fn = sys.argv[2]
    extract(in_fn, out_fn)

if __name__ == '__main__':
    main()