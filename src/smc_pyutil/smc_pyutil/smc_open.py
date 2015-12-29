#!/usr/bin/env python3

###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014--2015, SageMathCloud Authors
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
###############################################################################


import json
import os
import sys

home = os.environ['HOME']

if 'TMUX' in os.environ:
    prefix = '\x1bPtmux;\x1b'
    postfix = '\x1b\\'
else:
    prefix = ''
    postfix = ''


def process(paths):
    v = []
    for path in paths:
        # if not os.path.exists(path):
        #    raise RuntimeError("path '%s' does not exist"%path)

        path = os.path.abspath(path)
        # determine name relative to home directory
        if path.startswith(home):
            name = path[len(home) + 1:]
        else:
            name = path

        # Is it a file or directory?
        if os.path.isdir(path):
            v.append({'directory': name})
        else:
            v.append({'file': name})

    if len(v) > 0:
        mesg = {'event': 'open', 'paths': v}
        mesg_json = json.dumps(mesg, separators=(',', ':'))
        print('{}\x1b]49;{}\x07{}'.format(prefix, mesg_json, postfix))


def main():
    if len(sys.argv) == 1:
        print("Usage: open [path names] ...")
        print("Opens each file (or directory) in the Sagemath Cloud web-based editor from the shell.")
        print("If the named file doesn't exist, you get an error (the file is *not* created).")
    else:
        process(sys.argv[1:])

if __name__ == "__main__":
    main()
